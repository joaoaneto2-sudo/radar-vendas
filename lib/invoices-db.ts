import type { Pool, PoolClient } from "pg";
import { NATURE_LABELS, CARD_EXPENSE_CATEGORY, type InvoiceBody } from "./expenses";
import type { InvoiceNature } from "./finance/invoice";

// Gravação da fatura do cartão. Cada parte da fatura se liga ao resto do sistema:
//  - despesa da empresa  -> vira uma DESPESA (sai do lucro antes da divisão), na data do vencimento;
//  - reposição           -> vira uma COMPRA DE ESTOQUE (kind reposicao), a pagar pelo fundo;
//  - estoque inicial     -> vira uma COMPRA DE ESTOQUE (kind inicial);
//  - pessoal da Fernanda -> só fica registrada (fora da empresa).
// Ao editar, as ligações são atualizadas no lugar (nada é apagado e recriado à toa).
// Tudo dentro de uma transação: ou grava tudo, ou nada.

type Db = Pool | PoolClient;

export class InvoiceConflict extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

type Fatura = { id: number; description: string; dueDate: string };
type ParteGravada = { id: number; nature: InvoiceNature; expense_id: number | null; stock_purchase_id: number | null };

const KIND_DA_COMPRA: Partial<Record<InvoiceNature, "inicial" | "reposicao">> = {
  estoque_inicial: "inicial",
  reposicao: "reposicao",
};

function descricaoDaLigacao(nature: InvoiceNature, descricao: string | null, fatura: Fatura): string {
  return descricao ?? (nature === "despesa_empresa" ? `Fatura do cartão: ${fatura.description}` : `${NATURE_LABELS[nature]} (${fatura.description})`);
}

/** Apaga a despesa ou a compra ligada a uma parte. Recusa se a compra já teve pagamento do fundo. */
async function removerLigacao(client: PoolClient, parte: ParteGravada) {
  if (parte.stock_purchase_id) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM fund_payments WHERE purchase_id = $1`, [parte.stock_purchase_id]);
    if (rows[0].n > 0) {
      throw new InvoiceConflict(
        "part_has_fund_payments",
        "Uma das partes já teve pagamento do fundo de reposição lançado. Apague esse pagamento antes de mudar ou remover a parte."
      );
    }
    await client.query(`DELETE FROM stock_purchases WHERE id = $1`, [parte.stock_purchase_id]);
  }
  if (parte.expense_id) await client.query(`DELETE FROM expenses WHERE id = $1`, [parte.expense_id]);
}

async function criarLigacao(
  client: PoolClient,
  partId: number,
  nature: InvoiceNature,
  amount: number,
  descricao: string | null,
  fatura: Fatura
) {
  if (nature === "despesa_empresa") {
    const { rows } = await client.query(
      `INSERT INTO expenses (expense_date, description, category, amount, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [fatura.dueDate, descricaoDaLigacao(nature, descricao, fatura), CARD_EXPENSE_CATEGORY, amount, `Criada pela fatura #${fatura.id}`]
    );
    await client.query(`UPDATE card_invoice_parts SET expense_id = $1 WHERE id = $2`, [rows[0].id, partId]);
  } else if (KIND_DA_COMPRA[nature]) {
    const { rows } = await client.query(
      `INSERT INTO stock_purchases (description, kind, amount, purchase_date, payment_method, notes)
       VALUES ($1, $2, $3, NULL, 'Cartão da empresa', $4) RETURNING id`,
      [descricaoDaLigacao(nature, descricao, fatura), KIND_DA_COMPRA[nature], amount, `Criada pela fatura #${fatura.id}`]
    );
    await client.query(`UPDATE card_invoice_parts SET stock_purchase_id = $1 WHERE id = $2`, [rows[0].id, partId]);
  }
}

async function atualizarLigacao(
  client: PoolClient,
  parte: ParteGravada,
  partId: number,
  amount: number,
  descricao: string | null,
  fatura: Fatura
) {
  if (parte.nature === "despesa_empresa") {
    if (!parte.expense_id) return criarLigacao(client, partId, parte.nature, amount, descricao, fatura);
    const r = await client.query(
      `UPDATE expenses SET expense_date = $1, description = $2, amount = $3 WHERE id = $4`,
      [fatura.dueDate, descricaoDaLigacao(parte.nature, descricao, fatura), amount, parte.expense_id]
    );
    if (r.rowCount === 0) return criarLigacao(client, partId, parte.nature, amount, descricao, fatura);
  } else if (KIND_DA_COMPRA[parte.nature]) {
    if (!parte.stock_purchase_id) return criarLigacao(client, partId, parte.nature, amount, descricao, fatura);
    const r = await client.query(
      `UPDATE stock_purchases SET description = $1, amount = $2 WHERE id = $3`,
      [descricaoDaLigacao(parte.nature, descricao, fatura), amount, parte.stock_purchase_id]
    );
    if (r.rowCount === 0) return criarLigacao(client, partId, parte.nature, amount, descricao, fatura);
  }
}

/** Cria (id nulo) ou atualiza uma fatura com as partes. Devolve o id da fatura. */
export async function saveInvoice(client: PoolClient, invoiceId: number | null, dados: Extract<InvoiceBody, { ok: true }>): Promise<number> {
  let id = invoiceId;
  if (id === null) {
    const { rows } = await client.query(
      `INSERT INTO card_invoices (description, due_date, closing_date, total_amount, status, paid_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [dados.description, dados.dueDate, dados.closingDate, dados.total, dados.status, dados.paidDate, dados.notes]
    );
    id = rows[0].id as number;
  } else {
    const { rowCount } = await client.query(
      `UPDATE card_invoices
          SET description = $1, due_date = $2, closing_date = $3, total_amount = $4,
              status = $5, paid_date = $6, notes = $7
        WHERE id = $8`,
      [dados.description, dados.dueDate, dados.closingDate, dados.total, dados.status, dados.paidDate, dados.notes, id]
    );
    if (rowCount === 0) throw new InvoiceConflict("not_found", "Fatura não encontrada.");
  }

  const fatura: Fatura = { id, description: dados.description, dueDate: dados.dueDate };
  const { rows: gravadas } = await client.query(
    `SELECT id, nature, expense_id, stock_purchase_id FROM card_invoice_parts WHERE invoice_id = $1`,
    [id]
  );
  const porId = new Map<number, ParteGravada>(gravadas.map((p) => [p.id, p]));
  const mantidas = new Set<number>();

  for (const parte of dados.parts) {
    const antiga = parte.id !== null ? porId.get(parte.id) : undefined;
    if (antiga && !mantidas.has(antiga.id)) {
      mantidas.add(antiga.id);
      if (antiga.nature === parte.nature) {
        await client.query(`UPDATE card_invoice_parts SET amount = $1, description = $2 WHERE id = $3`, [parte.amount, parte.description, antiga.id]);
        await atualizarLigacao(client, antiga, antiga.id, parte.amount, parte.description, fatura);
      } else {
        // Mudou o tipo da parte: a ligação antiga sai e uma nova entra.
        await removerLigacao(client, antiga);
        await client.query(
          `UPDATE card_invoice_parts SET nature = $1, amount = $2, description = $3, expense_id = NULL, stock_purchase_id = NULL WHERE id = $4`,
          [parte.nature, parte.amount, parte.description, antiga.id]
        );
        await criarLigacao(client, antiga.id, parte.nature, parte.amount, parte.description, fatura);
      }
    } else {
      const { rows } = await client.query(
        `INSERT INTO card_invoice_parts (invoice_id, nature, amount, description) VALUES ($1, $2, $3, $4) RETURNING id`,
        [id, parte.nature, parte.amount, parte.description]
      );
      await criarLigacao(client, rows[0].id, parte.nature, parte.amount, parte.description, fatura);
    }
  }

  // Partes que existiam e não vieram mais: saem, com a despesa ou a compra que criaram.
  for (const antiga of gravadas) {
    if (mantidas.has(antiga.id)) continue;
    await removerLigacao(client, antiga);
    await client.query(`DELETE FROM card_invoice_parts WHERE id = $1`, [antiga.id]);
  }
  return id;
}

export async function deleteInvoice(client: PoolClient, invoiceId: number): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT id, nature, expense_id, stock_purchase_id FROM card_invoice_parts WHERE invoice_id = $1`,
    [invoiceId]
  );
  for (const parte of rows) await removerLigacao(client, parte);
  const r = await client.query(`DELETE FROM card_invoices WHERE id = $1`, [invoiceId]);
  return (r.rowCount ?? 0) > 0;
}

const DIA = (c: string) => `to_char(${c}, 'YYYY-MM-DD')`;

export async function listInvoices(db: Db, onlyId: number | null = null) {
  const { rows } = await db.query(
    `SELECT ci.id, ci.description, ${DIA("ci.due_date")} AS due_date, ${DIA("ci.closing_date")} AS closing_date,
            ci.total_amount, ci.status, ${DIA("ci.paid_date")} AS paid_date, ci.notes,
            COALESCE((SELECT json_agg(json_build_object(
                        'id', p.id, 'nature', p.nature, 'description', p.description, 'amount', p.amount,
                        'expense_id', p.expense_id, 'stock_purchase_id', p.stock_purchase_id) ORDER BY p.id)
                       FROM card_invoice_parts p WHERE p.invoice_id = ci.id), '[]'::json) AS parts
       FROM card_invoices ci
      WHERE ($1::int IS NULL OR ci.id = $1)
      ORDER BY ci.due_date DESC, ci.id DESC`,
    [onlyId]
  );
  return rows;
}
