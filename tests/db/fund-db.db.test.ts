import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../lib/migrations";
import { desfazerPagamento, listarComprasDoFundo, registrarPagamento } from "../../lib/fund-db";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();

describe.skipIf(!disponivel)("fundo de reposição: consultas", () => {
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
    await pool.query(`DELETE FROM stock_purchases`);
  });

  async function compra(descricao: string, kind: string, valor: number, data: string | null): Promise<number> {
    const { rows } = await pool.query(
      `INSERT INTO stock_purchases (description, kind, amount, purchase_date) VALUES ($1, $2, $3, $4) RETURNING id`,
      [descricao, kind, valor, data]
    );
    return rows[0].id;
  }

  it("lista só as reposições, da mais antiga para a mais nova, sem data por último", async () => {
    await compra("Estoque inicial", "inicial", 5000, "2026-08-10");
    await compra("Reposição B", "reposicao", 300, "2026-09-15");
    await compra("Reposição A", "reposicao", 200, "2026-09-05");
    await compra("Reposição sem data", "reposicao", 100, null);
    const lista = await listarComprasDoFundo(pool);
    expect(lista.map((c) => c.description)).toEqual(["Reposição A", "Reposição B", "Reposição sem data"]);
    expect(lista[0]).toMatchObject({ amountCents: 20000, paidCents: 0, payments: [], purchase_date: "2026-09-05" });
  });

  it("registrar pagamento soma no que já foi pago, e desfazer devolve", async () => {
    const id = await compra("Reposição A", "reposicao", 1000, "2026-09-05");
    const p1 = await registrarPagamento(pool, { purchaseId: id, amount: "250.50", paidDate: "2026-09-06", notes: "parte 1" });
    await registrarPagamento(pool, { purchaseId: id, amount: "100.00", paidDate: "2026-09-08", notes: null });
    let lista = await listarComprasDoFundo(pool);
    expect(lista[0].paidCents).toBe(35050);
    expect(lista[0].payments.map((p) => [p.paid_date, Number(p.amount), p.notes])).toEqual([
      ["2026-09-06", 250.5, "parte 1"],
      ["2026-09-08", 100, null],
    ]);
    expect(await desfazerPagamento(pool, p1)).toBe(true);
    expect(await desfazerPagamento(pool, p1)).toBe(false); // já tinha sido desfeito
    lista = await listarComprasDoFundo(pool);
    expect(lista[0].paidCents).toBe(10000);
  });

  it("apagar a compra leva os pagamentos junto", async () => {
    const id = await compra("Reposição A", "reposicao", 1000, "2026-09-05");
    await registrarPagamento(pool, { purchaseId: id, amount: "10.00", paidDate: "2026-09-06", notes: null });
    await pool.query(`DELETE FROM stock_purchases WHERE id = $1`, [id]);
    expect((await pool.query(`SELECT count(*)::int AS n FROM fund_payments`)).rows[0].n).toBe(0);
  });

  it("o banco recusa pagamento zero ou negativo", async () => {
    const id = await compra("Reposição A", "reposicao", 1000, "2026-09-05");
    await expect(registrarPagamento(pool, { purchaseId: id, amount: "0.00", paidDate: "2026-09-06", notes: null })).rejects.toThrow();
  });
});
