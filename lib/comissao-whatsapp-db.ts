import type { Pool } from "pg";
import { CATEGORIA_COMISSAO, DESCRICAO_COMISSAO, lerComissao } from "./comissao-whatsapp";

// Grava como despesa do dia a comissão paga às funcionárias que a Fernanda posta no grupo.
// Cada mensagem vira no máximo uma despesa: o message_id fica em comissoes_whatsapp.

export interface MensagemDeComissao {
  messageId: string;
  texto: string;
  enviadaEm: string; // ISO; o dia da despesa é o dia da mensagem no horário de Recife
  origem?: string | null;
}

export type ResultadoDaComissao =
  | { situacao: "gravada"; expenseId: number; dia: string; valor: number; conferiu: boolean; repetida: false }
  | { situacao: "ja_existe"; expenseId: number | null; repetida: true }
  | { situacao: "recusada"; motivo: string; repetida: boolean };

export function diaEmRecife(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

export async function gravarComissaoDoWhatsapp(pool: Pool, msg: MensagemDeComissao): Promise<ResultadoDaComissao> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["comissao-whatsapp:" + msg.messageId]);
    const anterior = await client.query(
      `SELECT situacao, expense_id, motivo FROM comissoes_whatsapp WHERE message_id = $1`,
      [msg.messageId]
    );
    if (anterior.rows.length > 0) {
      await client.query("COMMIT");
      const a = anterior.rows[0];
      if (a.situacao === "recusada") return { situacao: "recusada", motivo: a.motivo ?? "", repetida: true };
      return { situacao: "ja_existe", expenseId: a.expense_id, repetida: true };
    }

    const dia = diaEmRecife(msg.enviadaEm);
    const leitura = lerComissao(msg.texto);
    if (!leitura.ok) {
      await client.query(
        `INSERT INTO comissoes_whatsapp (message_id, situacao, motivo, texto, origem, enviada_em, dia)
         VALUES ($1, 'recusada', $2, $3, $4, $5, $6)`,
        [msg.messageId, leitura.motivo, msg.texto, msg.origem ?? null, msg.enviadaEm, dia]
      );
      await client.query("COMMIT");
      return { situacao: "recusada", motivo: leitura.motivo, repetida: false };
    }

    const valor = leitura.totalCents / 100;
    const nota = `Lançada pelo Roberto a partir do grupo: "${msg.texto.slice(0, 300)}"` +
      (leitura.conferiu ? "" : " (a soma das parcelas não bate com o total; valeu o total)");
    const { rows } = await client.query(
      `INSERT INTO expenses (expense_date, description, category, amount, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [dia, DESCRICAO_COMISSAO, CATEGORIA_COMISSAO, valor.toFixed(2), nota]
    );
    const expenseId = rows[0].id as number;
    await client.query(
      `INSERT INTO comissoes_whatsapp (message_id, situacao, expense_id, valor, texto, origem, enviada_em, dia)
       VALUES ($1, 'gravada', $2, $3, $4, $5, $6, $7)`,
      [msg.messageId, expenseId, valor.toFixed(2), msg.texto, msg.origem ?? null, msg.enviadaEm, dia]
    );
    await client.query("COMMIT");
    return { situacao: "gravada", expenseId, dia, valor, conferiu: leitura.conferiu, repetida: false };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
