import type { Pool } from "pg";
import { marcarQuem, type Quem } from "./audit";
import { DESFAZIVEIS, TABELAS_REGISTRADAS, tituloDaLinha, type Linha } from "./change-log";

// Desfazer uma mudança do histórico (só os casos simples, ver DESFAZIVEIS em lib/change-log.ts).
// - Edição: volta cada campo para o valor de antes, mas só se a linha ainda está do jeito que a edição deixou.
// - Exclusão: coloca a linha de volta com o mesmo número, se nada impede.
// Cada mudança só pode ser desfeita uma vez (tabela change_undo). O próprio "desfazer" também fica no histórico.

export type ErroDoDesfazer = "not_found" | "not_undoable" | "already_undone" | "changed_since" | "already_exists" | "missing_reference";

export type ResultadoDoDesfazer = { ok: true; titulo: string } | { ok: false; error: ErroDoDesfazer; message: string };

const falha = (error: ErroDoDesfazer, message: string): ResultadoDoDesfazer => ({ ok: false, error, message });

// Nomes de coluna vêm do próprio banco (to_jsonb), mas só usamos os que têm cara de nome de coluna.
const COLUNA = /^[a-z_][a-z0-9_]*$/;

export async function desfazerAlteracao(pool: Pool, logId: number, quem: Quem): Promise<ResultadoDoDesfazer> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await marcarQuem(client, quem);

    const { rows } = await client.query(
      `SELECT id, table_name, row_id, op, before, after, tx_id::text AS tx_id FROM change_log WHERE id = $1 FOR UPDATE`,
      [logId]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return falha("not_found", "Essa mudança não foi encontrada no histórico.");
    }
    const log = rows[0] as { table_name: string; row_id: number | null; op: "UPDATE" | "DELETE"; before: Linha; after: Linha | null; tx_id: string };
    const tabela = log.table_name;

    if (!(DESFAZIVEIS[tabela] ?? []).includes(log.op) || log.row_id === null) {
      await client.query("ROLLBACK");
      return falha("not_undoable", "Esse tipo de mudança ainda não pode ser desfeito por aqui.");
    }
    const { rows: mesmaOperacao } = await client.query(
      `SELECT count(*)::int AS n FROM change_log WHERE tx_id = $1::bigint AND table_name = ANY($2::text[])`,
      [log.tx_id, TABELAS_REGISTRADAS]
    );
    if (mesmaOperacao[0].n !== 1) {
      await client.query("ROLLBACK");
      return falha("not_undoable", "Essa mudança mexeu em várias coisas juntas e ainda não pode ser desfeita por aqui.");
    }
    const { rows: feitas } = await client.query(`SELECT 1 FROM change_undo WHERE change_id = $1`, [logId]);
    if (feitas.length > 0) {
      await client.query("ROLLBACK");
      return falha("already_undone", "Essa mudança já foi desfeita.");
    }

    // `tabela` só chega aqui se está em DESFAZIVEIS, então é seguro escrevê-la no comando.
    const colunas = Object.keys(log.before).filter((c) => COLUNA.test(c));
    try {
      if (log.op === "UPDATE") {
        const { rows: atual } = await client.query(
          `SELECT (to_jsonb(t) = $2::jsonb) AS igual FROM ${tabela} t WHERE t.id = $1 FOR UPDATE`,
          [log.row_id, JSON.stringify(log.after)]
        );
        if (atual.length === 0 || !atual[0].igual) {
          await client.query("ROLLBACK");
          return falha("changed_since", "Esse registro já foi mudado ou apagado depois dessa alteração, então ela não pode ser desfeita sozinha.");
        }
        const mudar = colunas.filter((c) => c !== "id").map((c) => `"${c}" = r."${c}"`);
        await client.query(
          `UPDATE ${tabela} SET ${mudar.join(", ")} FROM jsonb_populate_record(NULL::${tabela}, $2::jsonb) r WHERE ${tabela}.id = $1`,
          [log.row_id, JSON.stringify(log.before)]
        );
      } else {
        const { rows: existe } = await client.query(`SELECT 1 FROM ${tabela} WHERE id = $1`, [log.row_id]);
        if (existe.length > 0) {
          await client.query("ROLLBACK");
          return falha("already_exists", "Esse registro já existe de novo, então não há o que restaurar.");
        }
        const lista = colunas.map((c) => `"${c}"`).join(", ");
        await client.query(
          `INSERT INTO ${tabela} (${lista}) SELECT ${lista} FROM jsonb_populate_record(NULL::${tabela}, $1::jsonb)`,
          [JSON.stringify(log.before)]
        );
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      if ((err as { code?: string })?.code === "23503") {
        return falha("missing_reference", "Algo ligado a esse registro (a compra, a venda ou o fabricante) não existe mais, então ele não pode voltar.");
      }
      throw err;
    }

    await client.query(`INSERT INTO change_undo (change_id, undone_by_id, undone_by_name) VALUES ($1, $2, $3)`, [logId, quem.id, quem.name]);
    await client.query("COMMIT");
    return { ok: true, titulo: tituloDaLinha(tabela, log.before) };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
