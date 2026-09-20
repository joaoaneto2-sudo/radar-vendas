import type { Pool, PoolClient } from "pg";
import { Cents, toCents } from "./finance/money";
import type { PagamentoValido } from "./fund-payments";

// Fundo de reposição: as consultas ao banco. As regras de um pagamento ficam em lib/fund-payments.ts
// e as contas do fundo (entrou, usado, saldo) em lib/finance/accounts.ts.

export type Consulta = Pick<Pool | PoolClient, "query">;

export interface PagamentoSalvo {
  id: number;
  paid_date: string; // AAAA-MM-DD
  amount: number | string;
  notes: string | null;
}

export interface CompraComPagamentos {
  id: number;
  description: string;
  purchase_date: string | null; // AAAA-MM-DD
  amount: number | string;
  amountCents: Cents;
  paidCents: Cents; // soma dos pagamentos do fundo
  payments: PagamentoSalvo[];
}

/** As compras de reposição (só elas: o fundo não paga estoque inicial), cada uma com os pagamentos do fundo. */
export async function listarComprasDoFundo(db: Consulta): Promise<CompraComPagamentos[]> {
  const { rows } = await db.query(
    `SELECT c.id, c.description, to_char(c.purchase_date, 'YYYY-MM-DD') AS purchase_date, c.amount,
            COALESCE(
              json_agg(json_build_object('id', f.id, 'paid_date', to_char(f.paid_date, 'YYYY-MM-DD'), 'amount', f.amount, 'notes', f.notes)
                       ORDER BY f.paid_date, f.id) FILTER (WHERE f.id IS NOT NULL),
              '[]'::json
            ) AS payments
       FROM stock_purchases c
       LEFT JOIN fund_payments f ON f.purchase_id = c.id
      WHERE c.kind = 'reposicao'
      GROUP BY c.id
      ORDER BY c.purchase_date NULLS LAST, c.id`
  );
  return rows.map((r) => {
    const pagamentos: PagamentoSalvo[] = Array.isArray(r.payments) ? r.payments : [];
    return {
      id: r.id,
      description: r.description,
      purchase_date: r.purchase_date,
      amount: r.amount,
      amountCents: toCents(r.amount),
      paidCents: pagamentos.reduce((t, p) => t + toCents(p.amount), 0),
      payments: pagamentos,
    };
  });
}

export async function registrarPagamento(db: Consulta, v: PagamentoValido): Promise<number> {
  const { rows } = await db.query(
    `INSERT INTO fund_payments (purchase_id, paid_date, amount, notes) VALUES ($1, $2, $3, $4) RETURNING id`,
    [v.purchaseId, v.paidDate, v.amount, v.notes]
  );
  return rows[0].id;
}

/** Desfaz um pagamento (o valor volta para "falta pagar" e o saldo do fundo sobe). false = não existia. */
export async function desfazerPagamento(db: Consulta, id: number): Promise<boolean> {
  const { rowCount } = await db.query(`DELETE FROM fund_payments WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
