import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { validarAcordo } from "../../lib/agreement";
import { desfazerUltima, lerAcordo, listarHistorico, salvarAcordo } from "../../lib/agreement-db";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();
const JOAO = { id: 1, name: "João" };
const FERNANDA = { id: 2, name: "Fernanda" };

describe.skipIf(!disponivel)("parâmetros do acordo: salvar, histórico e desfazer", () => {
  let pool: Pool;
  let apagar: () => Promise<void>;

  beforeAll(async () => {
    const banco = await criarBancoDescartavel();
    pool = banco.pool;
    apagar = banco.apagar;
    await runMigrations(pool);
  });
  afterAll(async () => {
    await apagar?.();
  });
  beforeEach(async () => {
    await pool.query(`DELETE FROM agreement_history`);
    await pool.query(
      `UPDATE agreement_settings SET partnership_start = '2026-09-01', retail_replenish_pct = 30, wholesale_replenish_pct = 0,
              consignment_replenish_pct = 30, joao_share_pct = 50, initial_stock_value = 15000`
    );
  });

  // Confere e salva do jeito que a API faz.
  async function mudar(entrada: Record<string, unknown>, quem = JOAO) {
    const { valores: atual } = await lerAcordo(pool);
    const r = validarAcordo(entrada, atual);
    if (!r.ok) throw new Error(r.message);
    return salvarAcordo(pool, atual, r.valores, r.mudancas, quem);
  }

  it("a migração 013 cria a tabela do histórico, vazia", async () => {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM agreement_history`);
    expect(rows[0].n).toBe(0);
    expect((await pool.query(`SELECT id FROM schema_migrations WHERE id = '013'`)).rowCount).toBe(1);
  });

  it("lê os valores de hoje", async () => {
    expect(await lerAcordo(pool)).toEqual({
      valores: { partnershipStart: "2026-09-01", retailPct: 30, wholesalePct: 0, consignmentPct: 30, joaoSharePct: 50, initialStockCents: 1500000 },
      cascadeMode: "recebimento",
    });
  });

  it("salva os valores novos e registra quem mudou, o antes e o depois", async () => {
    expect(await mudar({ retail_replenish_pct: "25", initial_stock_value: "12345,60" })).toBe(true);
    const { valores } = await lerAcordo(pool);
    expect(valores).toMatchObject({ retailPct: 25, initialStockCents: 1234560, consignmentPct: 30 });

    const historico = await listarHistorico(pool);
    expect(historico).toHaveLength(1);
    expect(historico[0]).toMatchObject({
      changedByName: "João",
      revertedAt: null,
      changes: [
        { campo: "retailPct", antes: 30, depois: 25 },
        { campo: "initialStockCents", antes: 1500000, depois: 1234560 },
      ],
    });
  });

  it("a mudança vale para as contas: o banco guarda as duas casas e a data", async () => {
    await mudar({ joao_share_pct: "47,5", partnership_start: "2026-08-15" });
    const { rows } = await pool.query(`SELECT joao_share_pct, to_char(partnership_start, 'YYYY-MM-DD') AS d FROM agreement_settings`);
    expect(rows[0]).toEqual({ joao_share_pct: "47.50", d: "2026-08-15" });
  });

  it("se alguém mudou no meio do caminho, recusa e não grava nada", async () => {
    const { valores: atual } = await lerAcordo(pool);
    const r = validarAcordo({ retail_replenish_pct: "20" }, atual);
    if (!r.ok) throw new Error("esperava ok");
    await pool.query(`UPDATE agreement_settings SET retail_replenish_pct = 35`); // outra pessoa mudou antes
    expect(await salvarAcordo(pool, atual, r.valores, r.mudancas, JOAO)).toBe(false);
    expect((await lerAcordo(pool)).valores.retailPct).toBe(35);
    expect(await listarHistorico(pool)).toHaveLength(0);
  });

  it("desfaz a última mudança e marca no histórico quem desfez", async () => {
    await mudar({ retail_replenish_pct: "25" });
    const r = await desfazerUltima(pool, FERNANDA);
    expect(r).toEqual({ ok: true, mudancas: [{ campo: "retailPct", antes: 30, depois: 25 }] });
    expect((await lerAcordo(pool)).valores.retailPct).toBe(30);
    const [linha] = await listarHistorico(pool);
    expect(linha.revertedByName).toBe("Fernanda");
    expect(linha.revertedAt).not.toBeNull();
  });

  it("desfaz em ordem: da mais nova para a mais antiga", async () => {
    await mudar({ retail_replenish_pct: "25" });
    await mudar({ retail_replenish_pct: "20", joao_share_pct: "40" });
    await desfazerUltima(pool, JOAO);
    expect((await lerAcordo(pool)).valores).toMatchObject({ retailPct: 25, joaoSharePct: 50 });
    await desfazerUltima(pool, JOAO);
    expect((await lerAcordo(pool)).valores).toMatchObject({ retailPct: 30, joaoSharePct: 50 });
    expect(await desfazerUltima(pool, JOAO)).toEqual({ ok: false, error: "nothing_to_undo" });
  });

  it("não desfaz se os valores de hoje já não são os que a mudança deixou", async () => {
    await mudar({ retail_replenish_pct: "25" });
    await pool.query(`UPDATE agreement_settings SET retail_replenish_pct = 40`); // mudança feita por fora do histórico
    expect(await desfazerUltima(pool, JOAO)).toEqual({ ok: false, error: "changed_since" });
    expect((await lerAcordo(pool)).valores.retailPct).toBe(40);
    expect((await listarHistorico(pool))[0].revertedAt).toBeNull();
  });

  it("sem histórico, não há o que desfazer", async () => {
    expect(await desfazerUltima(pool, JOAO)).toEqual({ ok: false, error: "nothing_to_undo" });
  });

  it("o histórico vem da mais nova para a mais antiga", async () => {
    await mudar({ retail_replenish_pct: "25" });
    await mudar({ retail_replenish_pct: "20" });
    const h = await listarHistorico(pool);
    expect(h.map((l) => l.changes[0].depois)).toEqual([20, 25]);
  });
});
