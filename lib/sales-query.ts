import type { Pool, PoolClient } from "pg";
import { toCents } from "./finance/money";
import type { PaymentDb } from "./sale-finance";
import { computeIncentive, incentiveToColumns, parseIncentiveBody } from "./sale-incentive";

// Consulta de venda usada pela lista e pelas respostas de salvar: traz junto as parcelas
// (payments) e a comissão do fabricante representado (commission_pct), para a tela não precisar
// de outra chamada.

export const SALE_SELECT = `
  SELECT s.*,
         to_char(s.stock_received_date, 'YYYY-MM-DD') AS stock_received_date,
         COALESCE(s.gross_value, s.sale_value) AS list_value,
         m.name AS manufacturer_ref_name,
         CASE WHEN m.represented THEN m.commission_pct END AS commission_pct,
         COALESCE(
           (SELECT json_agg(json_build_object(
                     'id', sp.id,
                     'due_date', to_char(sp.due_date, 'YYYY-MM-DD'),
                     'amount', sp.amount,
                     'status', sp.status,
                     'received_date', to_char(sp.received_date, 'YYYY-MM-DD'))
                   ORDER BY sp.due_date NULLS LAST, sp.id)
              FROM sale_payments sp WHERE sp.sale_id = s.id),
           '[]'::json) AS payments
    FROM sales s
    LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
`;

/** Troca todas as parcelas da venda pelas informadas (dentro da transação de quem chamou). */
export async function savePayments(client: PoolClient, saleId: number, payments: PaymentDb[]) {
  await client.query("DELETE FROM sale_payments WHERE sale_id = $1", [saleId]);
  for (const p of payments) {
    await client.query(
      `INSERT INTO sale_payments (sale_id, due_date, amount, status, received_date)
       VALUES ($1, $2, $3, $4, $5)`,
      [saleId, p.due_date, p.amount, p.status, p.received_date]
    );
  }
}

/** Saldo de cashback do cliente em centavos: ganho menos usado nas vendas ativas. */
export async function cashbackBalanceCents(
  db: Pool | PoolClient,
  clientId: number | null,
  excludeSaleId: number | null = null
): Promise<number> {
  if (!clientId) return 0;
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(cashback_earned - cashback_used), 0) AS saldo
       FROM sales
      WHERE client_id = $1 AND status = 'ativa' AND ($2::int IS NULL OR id <> $2)`,
    [clientId, excludeSaleId]
  );
  return Math.max(toCents(rows[0].saldo), 0);
}

export interface IncentiveColumns {
  saleValue: number;
  grossValue: number | null;
  discountPct: number | null;
  cashbackPct: number | null;
  cashbackEarned: number;
  cashbackUsed: number;
}

/**
 * Se a tela mandou o bloco de desconto/cashback, recalcula tudo no servidor (o valor da venda
 * guardado é sempre o que o cliente paga). O saldo usado é limitado ao saldo do cliente.
 * Devolve null quando o bloco não veio: aí nada muda.
 */
export async function resolveIncentive(
  db: Pool | PoolClient,
  body: Record<string, unknown>,
  clientId: number | null,
  saleId: number | null
): Promise<IncentiveColumns | null> {
  const lido = parseIncentiveBody(body);
  if (!lido) return null;
  const available = await cashbackBalanceCents(db, clientId, saleId);
  const r = computeIncentive({
    listValue: lido.listValue,
    kind: lido.kind,
    pct: lido.pct,
    cashbackUsed: lido.cashbackUsed,
    availableCents: available,
  });
  return incentiveToColumns(r);
}
