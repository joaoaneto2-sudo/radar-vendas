import type { Pool, PoolClient } from "pg";

// Quem fez a mudança. O banco registra sozinho cada edição e exclusão (tabela change_log), mas não sabe
// quem está logado: o site avisa, no começo de cada operação, com app.user_id e app.user_name.
// Vale só até o fim da operação (set_config com "true").

export interface Quem {
  id: number | null;
  name: string | null;
}

export const NINGUEM: Quem = { id: null, name: null };

/** Avisa o banco quem está fazendo a operação. Precisa estar dentro de uma transação (BEGIN). */
export async function marcarQuem(client: Pick<PoolClient, "query">, quem: Quem): Promise<void> {
  await client.query(`SELECT set_config('app.user_id', $1, true), set_config('app.user_name', $2, true)`, [
    quem.id === null ? "" : String(quem.id),
    quem.name ?? "",
  ]);
}

/** Roda a operação numa transação já marcada com quem a fez; desfaz tudo se algo der errado. */
export async function comQuem<T>(pool: Pool, quem: Quem, operacao: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await marcarQuem(client, quem);
    const resultado = await operacao(client);
    await client.query("COMMIT");
    return resultado;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
