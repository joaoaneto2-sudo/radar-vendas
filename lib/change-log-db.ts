import type { Pool } from "pg";
import { TABELAS_REGISTRADAS, type LinhaDoLog } from "./change-log";

// Leitura do registro de alterações (tabela change_log). As frases e a organização ficam em lib/change-log.ts.

export async function listarRegistro(db: Pick<Pool, "query">, limite = 500): Promise<LinhaDoLog[]> {
  const { rows } = await db.query(
    `SELECT id, at, tx_id::text AS tx_id, table_name, row_id, op, before, after, user_name
       FROM change_log
      WHERE table_name = ANY($2::text[])
      ORDER BY at DESC, id DESC
      LIMIT $1`,
    [limite, TABELAS_REGISTRADAS]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    at: new Date(r.at).toISOString(),
    txId: r.tx_id,
    table: r.table_name,
    rowId: r.row_id === null ? null : Number(r.row_id),
    op: r.op,
    before: r.before,
    after: r.after,
    userName: r.user_name,
  }));
}
