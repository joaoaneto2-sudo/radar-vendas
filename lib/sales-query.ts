import type { PoolClient } from "pg";
import type { PaymentDb } from "./sale-finance";

// Consulta de venda usada pela lista e pelas respostas de salvar: traz junto as parcelas
// (payments) e a comissão do fabricante representado (commission_pct), para a tela não precisar
// de outra chamada.

export const SALE_SELECT = `
  SELECT s.*,
         to_char(s.stock_received_date, 'YYYY-MM-DD') AS stock_received_date,
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
