import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getFinanceSummary } from "../../lib/finance/load";
import { runMigrations } from "../../lib/migrations";
import { ESPERADO, VENDAS_DO_BRIEFING } from "../fixtures";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

// Teste de aceitação de ponta a ponta: dados do briefing gravados num banco
// de teste, lidos pelo mesmo caminho que o painel vai usar, e conferidos
// com os números da seção 6.

const disponivel = await bancoDeTesteDisponivel();

describe.skipIf(!disponivel)("teste de aceitação com banco (briefing, seção 6)", () => {
  let pool: Pool;
  let apagar: () => Promise<void>;

  beforeAll(async () => {
    const banco = await criarBancoDescartavel();
    pool = banco.pool;
    apagar = banco.apagar;
    await runMigrations(pool);

    for (const [data, cliente, valor] of VENDAS_DO_BRIEFING) {
      await pool.query(
        `INSERT INTO sales (sale_date, client_name, sale_value, payment_method)
         VALUES ($1, $2, $3, 'Não informada')`,
        [data, cliente, valor]
      );
    }
    await pool.query(`INSERT INTO joao_payments (paid_date, amount, notes) VALUES ('2026-09-01', 1000, 'Pagamento inicial')`);
    await pool.query(
      `INSERT INTO stock_purchases (description, kind, amount, purchase_date, payment_method) VALUES
         ('Estoque inicial', 'inicial', 15000, NULL, 'Cartão da empresa'),
         ('Reposição CD', 'reposicao', 2302, '2026-09-01', 'Cartão da empresa'),
         ('Reposição SM', 'reposicao', 3018, '2026-09-03', 'Cartão da empresa')`
    );
    await pool.query(
      `INSERT INTO liabilities (description, responsible, total_amount) VALUES ('Passivo da empresa', 'Fernanda', 30000)`
    );
  });

  afterAll(async () => {
    await apagar?.();
  });

  function conferirNumerosDoBriefing(r: Awaited<ReturnType<typeof getFinanceSummary>>) {
    expect(r.cascade.totals.soldCents).toBe(ESPERADO.vendido);
    expect(r.cascade.totals.replenishCents).toBe(ESPERADO.reposicao);
    expect(r.cascade.totals.profitCents).toBe(ESPERADO.lucro);
    expect(r.cascade.totals.abatedCents).toBe(ESPERADO.abatido);
    expect(r.cascade.debt.balanceCents).toBe(ESPERADO.saldoDevedor);
    expect(r.cascade.debt.paidFraction).toBeCloseTo(0.4268, 4);
    expect(r.cascade.totals.fernandaReceivesCents).toBe(ESPERADO.fernandaRecebe);
    expect(r.cascade.totals.joaoReceivesCents).toBe(ESPERADO.joaoRecebe);
    expect(r.cascade.check.fernandaPlusJoaoEqualsProfit).toBe(true);
    expect(r.fund.payableCents).toBe(ESPERADO.reposicoesAPagar);
    expect(r.fund.balanceMinusPayableCents).toBe(ESPERADO.fundoMenosAPagar);
    expect(r.liabilities.totalCents).toBe(3000000);
    expect(r.liabilities.paidCents).toBe(0);
    expect(r.liabilities.balanceCents).toBe(3000000);
  }

  it("modo padrão ('recebimento'): vendas sem parcelas contam na data da venda e os números batem", async () => {
    const r = await getFinanceSummary(pool);
    expect(r.settings.mode).toBe("recebimento");
    conferirNumerosDoBriefing(r);
  });

  it("modo 'venda': os mesmos números", async () => {
    await pool.query(`UPDATE agreement_settings SET cascade_mode = 'venda'`);
    conferirNumerosDoBriefing(await getFinanceSummary(pool));
    await pool.query(`UPDATE agreement_settings SET cascade_mode = 'recebimento'`);
  });

  it("uma venda a prazo ainda não recebida sai da cascata até o dinheiro entrar", async () => {
    // Elizabete (id 7, R$ 280) passa a ser Pix a prazo, parcela prevista.
    await pool.query(`INSERT INTO sale_payments (sale_id, due_date, amount) VALUES (7, '2026-09-15', 280)`);

    const r = await getFinanceSummary(pool);
    expect(r.cascade.totals.soldCents).toBe(ESPERADO.vendido);
    expect(r.cascade.totals.pendingCents).toBe(28000);
    expect(r.cascade.totals.replenishCents).toBe(ESPERADO.reposicao - 8400);

    // Quando o dinheiro entra, volta para as contas, na data do recebimento.
    await pool.query(`UPDATE sale_payments SET status = 'recebida', received_date = '2026-09-19' WHERE sale_id = 7`);
    const depois = await getFinanceSummary(pool);
    expect(depois.cascade.totals.pendingCents).toBe(0);
    expect(depois.cascade.totals.replenishCents).toBe(ESPERADO.reposicao);
    expect(depois.cascade.totals.profitCents).toBe(ESPERADO.lucro);
    expect(depois.cascade.check.fernandaPlusJoaoEqualsProfit).toBe(true);
  });

  it("venda cancelada sai de todas as contas", async () => {
    await pool.query(`UPDATE sales SET status = 'cancelada', cancelled_at = now() WHERE id = 9`); // Michele, R$ 2.507
    const r = await getFinanceSummary(pool);
    expect(r.cascade.totals.soldCents).toBe(ESPERADO.vendido - 250700);
    expect(r.cascade.totals.replenishCents).toBe(ESPERADO.reposicao - 75210);
    await pool.query(`UPDATE sales SET status = 'ativa', cancelled_at = NULL WHERE id = 9`);
  });
});
