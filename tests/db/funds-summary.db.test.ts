import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarRegraDeFundo } from "../../lib/funds-db";
import { loadFinanceInputs, summarize } from "../../lib/finance/load";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();
const JOAO = { id: 1, name: "João" };

describe.skipIf(!disponivel)("fundos no resumo financeiro (do banco até as contas)", () => {
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
    await pool.query(`DELETE FROM fund_rules`);
    await pool.query(`DELETE FROM expenses`);
    await pool.query(`DELETE FROM sales`);
  });

  const idDe = async (nome: string) => (await pool.query(`SELECT id FROM funds WHERE name = $1`, [nome])).rows[0].id as number;

  it("uma venda de R$ 250 com regras nos fundos separa e reduz o lucro a dividir", async () => {
    await pool.query(`INSERT INTO sales (sale_date, client_name, sale_value) VALUES ('2026-09-01', 'Kika', 250)`);
    const prospeccao = await idDe("Prospecção");
    const custos = await idDe("Custos fixos");
    await criarRegraDeFundo(pool, { fundId: prospeccao, pct: 5, fromMonth: "2026-09-01", toMonth: null }, JOAO);
    await criarRegraDeFundo(pool, { fundId: custos, pct: 4, fromMonth: "2026-09-01", toMonth: null }, JOAO);

    const resumo = summarize(await loadFinanceInputs(pool), { today: "2026-09-15" });
    const e = resumo.cascade.events[0];
    expect(e.replenishCents).toBe(7500); // 30% do acordo padrão
    expect(e.fundsCents[prospeccao]).toBe(1250);
    expect(e.fundsCents[custos]).toBe(1000);
    expect(e.distributableCents).toBe(15250); // 25000 - 7500 - 1250 - 1000
    const conta = resumo.cascade.funds.find((f) => f.fundId === prospeccao)!;
    expect(conta).toMatchObject({ enteredCents: 1250, balanceCents: 1250, pctThisMonth: 5 });
    expect(resumo.cascade.funds).toHaveLength(7); // um por fundo, mesmo os que estão em 0%
  });

  it("uma despesa com fundo é paga por ele e o resto sai do lucro", async () => {
    await pool.query(`INSERT INTO sales (sale_date, client_name, sale_value) VALUES ('2026-09-01', 'Kika', 250)`);
    const custos = await idDe("Custos fixos");
    await criarRegraDeFundo(pool, { fundId: custos, pct: 4, fromMonth: "2026-09-01", toMonth: null }, JOAO);
    await pool.query(`INSERT INTO expenses (expense_date, description, amount, fund_id) VALUES ('2026-09-02', 'Contador', 150, $1)`, [custos]);

    const resumo = summarize(await loadFinanceInputs(pool), { today: "2026-09-15" });
    const d = resumo.cascade.events.find((ev) => ev.kind === "despesa")!;
    expect(d.fundCoveredCents).toBe(1000); // o fundo só tinha R$ 10,00
    expect(d.carryAfterCents).toBe(14000);
    expect(resumo.cascade.funds.find((f) => f.fundId === custos)).toMatchObject({ spentCents: 1000, balanceCents: 0 });
  });

  it("sem nenhuma regra, os números são os de sempre", async () => {
    await pool.query(`INSERT INTO sales (sale_date, client_name, sale_value) VALUES ('2026-09-01', 'Kika', 250)`);
    const resumo = summarize(await loadFinanceInputs(pool), { today: "2026-09-15" });
    expect(resumo.cascade.events[0].distributableCents).toBe(17500); // 25000 - 7500
    expect(resumo.cascade.totals.fundsCents).toBe(0);
  });

  it("um fundo arquivado continua entrando na conta dos meses em que teve regra", async () => {
    await pool.query(`INSERT INTO sales (sale_date, client_name, sale_value) VALUES ('2026-08-10', 'Kika', 100)`);
    const digital = await idDe("Digital");
    await criarRegraDeFundo(pool, { fundId: digital, pct: 5, fromMonth: "2026-08-01", toMonth: "2026-08-01" }, JOAO);
    await pool.query(`UPDATE funds SET active = false WHERE id = $1`, [digital]);
    const resumo = summarize(await loadFinanceInputs(pool), { today: "2026-09-15" });
    expect(resumo.cascade.funds.find((f) => f.fundId === digital)).toMatchObject({ enteredCents: 500, pctThisMonth: 0 });
  });
});
