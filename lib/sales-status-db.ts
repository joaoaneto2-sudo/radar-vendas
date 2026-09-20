import type { Pool } from "pg";
import { Cents, toCents } from "./finance/money";

// Cancelar e reativar uma venda. Cancelar não apaga: a venda fica no relatório como "cancelada",
// sai de todas as contas, e a peça volta ao estoque. Dá para reativar depois.
// O cashback do cliente já ignora vendas canceladas (o saldo é calculado só com as ativas).

export type NovoStatus = "ativa" | "cancelada";

export type ResultadoDoStatus =
  | { ok: true; mudou: boolean; recebidoCents: Cents }
  | { ok: false; error: "not_found" };

export async function mudarStatusDaVenda(pool: Pool, id: number, novo: NovoStatus): Promise<ResultadoDoStatus> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT status, product_id, price_tier FROM sales WHERE id = $1 FOR UPDATE`, [id]);
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "not_found" };
    }
    const venda = rows[0];

    const { rows: recebidas } = await client.query(
      `SELECT COALESCE(sum(amount), 0) AS total FROM sale_payments WHERE sale_id = $1 AND status = 'recebida'`,
      [id]
    );
    const recebidoCents = toCents(recebidas[0].total);

    if (venda.status === novo) {
      await client.query("ROLLBACK");
      return { ok: true, mudou: false, recebidoCents };
    }

    await client.query(
      `UPDATE sales SET status = $1, cancelled_at = CASE WHEN $1 = 'cancelada' THEN now() ELSE NULL END WHERE id = $2`,
      [novo, id]
    );

    // Peça de atacado é do fabricante: nunca saiu do nosso estoque, então não volta.
    if (venda.product_id && venda.price_tier !== "atacado") {
      if (novo === "cancelada") {
        await client.query(`UPDATE products SET stock_qty = stock_qty + 1 WHERE id = $1`, [venda.product_id]);
      } else {
        await client.query(`UPDATE products SET stock_qty = GREATEST(stock_qty - 1, 0) WHERE id = $1`, [venda.product_id]);
      }
    }

    await client.query("COMMIT");
    return { ok: true, mudou: true, recebidoCents };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
