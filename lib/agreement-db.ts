import type { Pool } from "pg";
import { centavosParaBanco, podeDesfazer, type AcordoValores, type Mudanca } from "./agreement";
import { toCents } from "./finance/money";

// Parâmetros do acordo: as consultas ao banco. As regras (conferir, comparar) ficam em lib/agreement.ts.

export interface Quem {
  id: number | null;
  name: string | null;
}

export interface LinhaDoHistorico {
  id: number;
  changedAt: string; // ISO
  changedByName: string | null;
  changes: Mudanca[];
  revertedAt: string | null;
  revertedByName: string | null;
}

export interface AcordoLido {
  valores: AcordoValores;
  cascadeMode: "recebimento" | "venda";
}

export async function lerAcordo(db: Pick<Pool, "query">): Promise<AcordoLido> {
  const { rows } = await db.query(
    `SELECT to_char(partnership_start, 'YYYY-MM-DD') AS partnership_start, retail_replenish_pct, wholesale_replenish_pct,
            consignment_replenish_pct, joao_share_pct, initial_stock_value, cascade_mode
       FROM agreement_settings WHERE id = 1`
  );
  const a = rows[0];
  if (!a) throw new Error("Parâmetros do acordo não encontrados (agreement_settings).");
  return {
    valores: {
      partnershipStart: a.partnership_start,
      retailPct: Number(a.retail_replenish_pct),
      wholesalePct: Number(a.wholesale_replenish_pct),
      consignmentPct: Number(a.consignment_replenish_pct),
      joaoSharePct: Number(a.joao_share_pct),
      initialStockCents: toCents(a.initial_stock_value),
    },
    cascadeMode: a.cascade_mode,
  };
}

// Grava os valores na linha única do acordo (usado por salvar e por desfazer).
async function gravarValores(client: Pick<Pool, "query">, v: AcordoValores): Promise<void> {
  await client.query(
    `UPDATE agreement_settings
        SET partnership_start = $1, retail_replenish_pct = $2, wholesale_replenish_pct = $3,
            consignment_replenish_pct = $4, joao_share_pct = $5, initial_stock_value = $6, updated_at = now()
      WHERE id = 1`,
    [v.partnershipStart, v.retailPct, v.wholesalePct, v.consignmentPct, v.joaoSharePct, centavosParaBanco(v.initialStockCents)]
  );
}

/**
 * Salva os valores novos e registra no histórico, tudo junto (ou nada).
 * `esperados` são os valores que a conferência viu: se alguém mudou no meio do caminho, recusa (false).
 */
export async function salvarAcordo(
  pool: Pool,
  esperados: AcordoValores,
  novos: AcordoValores,
  mudancas: Mudanca[],
  quem: Quem
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT 1 FROM agreement_settings WHERE id = 1 FOR UPDATE`);
    const { valores } = await lerAcordo(client);
    if (JSON.stringify(valores) !== JSON.stringify(esperados)) {
      await client.query("ROLLBACK");
      return false;
    }
    await gravarValores(client, novos);
    await client.query(`INSERT INTO agreement_history (changed_by_id, changed_by_name, changes) VALUES ($1, $2, $3::jsonb)`, [
      quem.id,
      quem.name,
      JSON.stringify(mudancas),
    ]);
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function listarHistorico(db: Pick<Pool, "query">, limite = 30): Promise<LinhaDoHistorico[]> {
  const { rows } = await db.query(
    `SELECT id, changed_at, changed_by_name, changes, reverted_at, reverted_by_name
       FROM agreement_history ORDER BY changed_at DESC, id DESC LIMIT $1`,
    [limite]
  );
  return rows.map((r) => ({
    id: r.id,
    changedAt: new Date(r.changed_at).toISOString(),
    changedByName: r.changed_by_name,
    changes: r.changes as Mudanca[],
    revertedAt: r.reverted_at ? new Date(r.reverted_at).toISOString() : null,
    revertedByName: r.reverted_by_name,
  }));
}

export type ResultadoDoDesfazer = { ok: true; mudancas: Mudanca[] } | { ok: false; error: "nothing_to_undo" | "changed_since" };

/**
 * Desfaz a última mudança que ainda não foi desfeita, voltando cada campo para o valor de antes.
 * Só vale se os valores de hoje ainda são os que ela deixou; senão apagaria uma mudança feita por fora do histórico.
 */
export async function desfazerUltima(pool: Pool, quem: Quem): Promise<ResultadoDoDesfazer> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT 1 FROM agreement_settings WHERE id = 1 FOR UPDATE`);
    const { rows } = await client.query(
      `SELECT id, changes FROM agreement_history WHERE reverted_at IS NULL ORDER BY changed_at DESC, id DESC LIMIT 1`
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "nothing_to_undo" };
    }
    const mudancas = rows[0].changes as Mudanca[];
    const { valores } = await lerAcordo(client);
    if (!podeDesfazer(valores, mudancas)) {
      await client.query("ROLLBACK");
      return { ok: false, error: "changed_since" };
    }
    const de_volta: AcordoValores = { ...valores };
    for (const m of mudancas) (de_volta as unknown as Record<string, number | string>)[m.campo] = m.antes;
    await gravarValores(client, de_volta);
    await client.query(`UPDATE agreement_history SET reverted_at = now(), reverted_by_name = $2 WHERE id = $1`, [rows[0].id, quem.name]);
    await client.query("COMMIT");
    return { ok: true, mudancas };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// Peças que entram na conta do estoque inicial mas ainda não têm data nem quantidade de compra.
const PECAS_SEM_DATA = `active AND sale_channel IS DISTINCT FROM 'atacado' AND purchase_date IS NULL AND cost IS NOT NULL`;

/** Quantas peças e quanto custam (1 unidade de cada) as que estão sem data de compra. Só olha, não muda nada. */
export async function pecasSemDataDeCompra(db: Pick<Pool, "query">): Promise<{ pieces: number; cents: number }> {
  const { rows } = await db.query(`SELECT count(*)::int AS n, COALESCE(sum(cost), 0) AS custo FROM products WHERE ${PECAS_SEM_DATA}`);
  return { pieces: rows[0].n, cents: toCents(rows[0].custo) };
}

/**
 * Marca como estoque inicial as peças sem data de compra: data = véspera do início da sociedade,
 * quantidade comprada = 1 (regra do João: 1 por peça). Só mexe em peça sem data; quem já tem data fica como está.
 */
export async function marcarComoEstoqueInicial(
  db: Pick<Pool, "query">,
  inicioDaSociedade: string
): Promise<{ pieces: number; cents: number }> {
  const { rows } = await db.query(
    `UPDATE products
        SET purchase_date = ($1::date - 1), purchase_qty = COALESCE(purchase_qty, 1)
      WHERE ${PECAS_SEM_DATA}
      RETURNING cost`,
    [inicioDaSociedade]
  );
  return { pieces: rows.length, cents: rows.reduce((soma, r) => soma + toCents(r.cost), 0) };
}
