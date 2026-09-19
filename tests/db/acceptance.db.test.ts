import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getFinanceSummary } from "../../lib/finance/load";
import { runMigrations } from "../../lib/migrations";
import { ESPERADO, VENDAS_DO_BRIEFING } from "../fixtures";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

// Teste de aceitação de ponta a ponta: dados do briefing gravados num banco
// de teste, lidos pelo mesmo caminho que o painel vai usar, e conferidos
// com os números da seção 6. Depois, as regras novas (atacado, despesas e fatura).

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
    await pool.query(
      `INSERT INTO receipts (kind, status, received_date, amount, partner, reason)
       VALUES ('aporte_socio', 'recebida', '2026-09-01', 1000, 'joao', 'Pagamento inicial')`
    );
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
    expect(r.cascade.check.fernandaPlusJoaoEqualsDistributable).toBe(true);
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
    expect(depois.cascade.check.fernandaPlusJoaoEqualsDistributable).toBe(true);

    await pool.query(`DELETE FROM sale_payments WHERE sale_id = 7`); // volta ao estado anterior
  });

  it("venda cancelada sai de todas as contas", async () => {
    await pool.query(`UPDATE sales SET status = 'cancelada', cancelled_at = now() WHERE id = 9`); // Michele, R$ 2.507
    const r = await getFinanceSummary(pool);
    expect(r.cascade.totals.soldCents).toBe(ESPERADO.vendido - 250700);
    expect(r.cascade.totals.replenishCents).toBe(ESPERADO.reposicao - 75210);
    await pool.query(`UPDATE sales SET status = 'ativa', cancelled_at = NULL WHERE id = 9`);
  });

  it("venda consignada usa o percentual de reposição do consignado", async () => {
    try {
      await pool.query(`UPDATE sales SET price_tier = 'consignado' WHERE id = 1`); // R$ 590
      await pool.query(`UPDATE agreement_settings SET consignment_replenish_pct = 20`);
      const r = await getFinanceSummary(pool);
      expect(r.cascade.totals.soldCents).toBe(ESPERADO.vendido); // consignado conta como venda
      // Nessa venda a reposição cai de 30% (R$ 177,00) para 20% (R$ 118,00): R$ 59,00 a menos.
      expect(r.cascade.totals.replenishCents).toBe(ESPERADO.reposicao - 5900);
    } finally {
      await pool.query(`UPDATE sales SET price_tier = 'varejo' WHERE id = 1`);
      await pool.query(`UPDATE agreement_settings SET consignment_replenish_pct = 30`);
    }
  });

  it("atacado da Bia Belutti: 20% de comissão, prevista 15 dias depois do estoque, e só entra na divisão quando o fabricante paga", async () => {
    try {
      await pool.query(
        `INSERT INTO manufacturers (name, represented, commission_pct, commission_days)
         VALUES ('Bia Belutti', true, 20, 15)`
      );
      // Venda de R$ 1.000 no atacado (id 10). O cliente pagou direto ao fabricante.
      await pool.query(
        `INSERT INTO sales (sale_date, client_name, sale_value, price_tier, manufacturer_id, stock_received_date, payment_method)
         VALUES ('2026-09-12', 'Revendedora Ana', 1000, 'atacado', 1, '2026-09-14', 'Pix direto ao fabricante')`
      );

      const antes = await getFinanceSummary(pool, { today: "2026-09-19" });
      expect(antes.wholesale.grossCents).toBe(100000);
      expect(antes.wholesale.commissionCents).toBe(20000);
      expect(antes.wholesale.pendingCents).toBe(20000);
      const item = antes.wholesale.manufacturers[0].items[0];
      expect(item).toMatchObject({ commissionCents: 20000, dueDate: "2026-09-29", status: "prevista" });
      // Ainda não recebemos: nada muda nas contas dos sócios nem no "total vendido".
      expect(antes.cascade.totals.soldCents).toBe(ESPERADO.vendido);
      expect(antes.cascade.totals.profitCents).toBe(ESPERADO.lucro);

      // Passou do prazo sem o fabricante pagar: atrasada.
      const atrasada = await getFinanceSummary(pool, { today: "2026-10-05" });
      expect(atrasada.wholesale.overdueCents).toBe(20000);
      expect(atrasada.wholesale.manufacturers[0].items[0].status).toBe("atrasada");

      // Lembrete lançado à mão: a comissão deve entrar em 10/10. Vale mais que a data automática.
      await pool.query(
        `INSERT INTO receipts (kind, status, expected_date, amount, manufacturer_id, reason)
         VALUES ('comissao_fabricante', 'prevista', '2026-10-10', 200, 1, 'Combinado com a Bia')`
      );
      const comLembrete = await getFinanceSummary(pool, { today: "2026-10-05" });
      expect(comLembrete.wholesale.overdueCents).toBe(0);
      expect(comLembrete.wholesale.manufacturers[0].items[0]).toMatchObject({ dueDate: "2026-10-10", status: "prevista" });
      expect(comLembrete.wholesale.manufacturers[0].reminders).toHaveLength(1);
      expect(comLembrete.cascade.totals.profitCents).toBe(ESPERADO.lucro); // lembrete não entra na conta

      // O fabricante paga a comissão: agora entra na divisão, sem virar "venda".
      await pool.query(
        `INSERT INTO receipts (kind, status, received_date, amount, manufacturer_id, from_name, from_nickname, reason)
         VALUES ('comissao_fabricante', 'recebida', '2026-09-30', 200, 1, 'Bia Belutti', 'Bia', 'Comissão da Ana')`
      );
      const depois = await getFinanceSummary(pool, { today: "2026-10-01" });
      expect(depois.wholesale.receivedCents).toBe(20000);
      expect(depois.wholesale.pendingCents).toBe(0);
      expect(depois.cascade.totals.soldCents).toBe(ESPERADO.vendido);
      expect(depois.cascade.totals.wholesaleCommissionCountedCents).toBe(20000);
      expect(depois.cascade.totals.profitCents).toBe(ESPERADO.lucro + 20000);
      expect(depois.cascade.totals.replenishCents).toBe(ESPERADO.reposicao); // sem reposição sobre a comissão
      expect(depois.cascade.check.fernandaPlusJoaoEqualsDistributable).toBe(true);
    } finally {
      await pool.query(`DELETE FROM receipts WHERE kind = 'comissao_fabricante'`);
      await pool.query(`DELETE FROM sales WHERE id = 10`);
      await pool.query(`DELETE FROM manufacturers WHERE name = 'Bia Belutti'`);
    }
  });

  it("atacado de fabricante que não é representado fica fora das contas e avisa", async () => {
    try {
      await pool.query(`INSERT INTO manufacturers (name) VALUES ('Fabricante comum')`);
      const { rows } = await pool.query(
        `INSERT INTO sales (sale_date, client_name, sale_value, price_tier, manufacturer_id)
         VALUES ('2026-09-12', 'Revendedora Bia', 1000, 'atacado', (SELECT id FROM manufacturers WHERE name = 'Fabricante comum'))
         RETURNING id`
      );
      const r = await getFinanceSummary(pool);
      expect(r.cascade.totals.profitCents).toBe(ESPERADO.lucro);
      expect(r.warnings.some((w) => w.code === "atacado_sem_fabricante_representado")).toBe(true);
      expect(r.wholesale.withoutManufacturerSaleIds).toEqual([rows[0].id]);
    } finally {
      await pool.query(`DELETE FROM sales WHERE client_name = 'Revendedora Bia'`);
      await pool.query(`DELETE FROM manufacturers WHERE name = 'Fabricante comum'`);
    }
  });

  it("aportes: o do João abate a dívida, o da Fernanda só fica registrado, e nenhum entra no lucro dividido", async () => {
    try {
      const antes = await getFinanceSummary(pool);
      expect(antes.cascade.debt.paidDirectCents).toBe(100000); // o aporte de R$ 1.000 de 01/09

      await pool.query(
        `INSERT INTO receipts (kind, status, received_date, amount, partner, reason) VALUES
           ('aporte_socio', 'recebida', '2026-09-10', 500, 'joao', 'Mais um pagamento'),
           ('aporte_socio', 'recebida', '2026-09-11', 3000, 'fernanda', 'Compra de ativo novo')`
      );
      const r = await getFinanceSummary(pool);
      expect(r.cascade.debt.paidDirectCents).toBe(150000); // só o do João
      expect(r.cascade.totals.profitCents).toBe(ESPERADO.lucro);
      expect(r.cascade.totals.distributableCents).toBe(ESPERADO.lucro);
      expect(r.liabilities.totalCents).toBe(3000000); // o aporte da Fernanda não vira passivo
      expect(r.cascade.check.fernandaPlusJoaoEqualsDistributable).toBe(true);
    } finally {
      await pool.query(`DELETE FROM receipts WHERE reason IN ('Mais um pagamento', 'Compra de ativo novo')`);
    }
  });

  it("outra receita (outros ramos da empresa) entra na divisão na data em que foi recebida", async () => {
    try {
      await pool.query(
        `INSERT INTO receipts (kind, status, received_date, amount, from_name, reason)
         VALUES ('outra_receita', 'recebida', '2026-09-15', 400, 'Revendedora Lu', 'Comissão de outro ramo')`
      );
      const r = await getFinanceSummary(pool);
      expect(r.cascade.totals.soldCents).toBe(ESPERADO.vendido); // não é venda
      expect(r.cascade.totals.otherIncomeCountedCents).toBe(40000);
      expect(r.cascade.totals.profitCents).toBe(ESPERADO.lucro + 40000);
      expect(r.cascade.totals.replenishCents).toBe(ESPERADO.reposicao); // sem reposição
      expect(r.cascade.check.fernandaPlusJoaoEqualsDistributable).toBe(true);
    } finally {
      await pool.query(`DELETE FROM receipts WHERE reason = 'Comissão de outro ramo'`);
    }
  });

  it("despesa da empresa sai antes da divisão e reduz o abatimento do João", async () => {
    try {
      await pool.query(
        `INSERT INTO expenses (expense_date, description, amount) VALUES ('2026-09-05', 'Anúncios', 100)`
      );
      const r = await getFinanceSummary(pool);
      expect(r.cascade.totals.expensesCents).toBe(10000);
      expect(r.cascade.totals.compensatedCents).toBe(10000);
      expect(r.cascade.totals.carryCents).toBe(0);
      expect(r.cascade.totals.profitCents).toBe(ESPERADO.lucro);
      expect(r.cascade.totals.distributableCents).toBe(ESPERADO.lucro - 10000);
      expect(r.cascade.totals.abatedCents).toBe(ESPERADO.abatido - 5000);
      expect(r.cascade.debt.balanceCents).toBe(ESPERADO.saldoDevedor + 5000);
      expect(r.cascade.totals.fernandaReceivesCents).toBe(ESPERADO.lucro - 10000);
      expect(r.cascade.check.fernandaPlusJoaoEqualsDistributable).toBe(true);
    } finally {
      await pool.query(`DELETE FROM expenses`);
    }
  });

  it("fatura do cartão que vence dia 30: as 4 partes somam o total e mostram quem paga", async () => {
    await pool.query(
      `INSERT INTO card_invoices (description, due_date, total_amount, status)
       VALUES ('Fatura do cartão da empresa (vence 30/09)', '2026-09-30', 10000, 'fechada')`
    );
    await pool.query(
      `INSERT INTO card_invoice_parts (invoice_id, nature, amount, description) VALUES
         (1, 'pessoal_fernanda', 1000, 'Compras pessoais'),
         (1, 'estoque_inicial', 5000, 'Joias compradas antes de 01/09'),
         (1, 'reposicao', 3000, 'Reposição depois de 01/09'),
         (1, 'despesa_empresa', 1000, 'Anúncios')`
    );
    const r = await getFinanceSummary(pool);
    const fatura = r.invoices[0];
    expect(fatura.closes).toBe(true);
    expect(fatura.fernandaPaysCents).toBe(600000);
    expect(fatura.fundPaysCents).toBe(300000);
    expect(fatura.companyExpenseCents).toBe(100000);
    expect(r.warnings.some((w) => w.code === "fatura_nao_fecha")).toBe(false);

    // Uma parte a menos: a fatura deixa de fechar e o painel avisa.
    await pool.query(`DELETE FROM card_invoice_parts WHERE nature = 'despesa_empresa'`);
    const semParte = await getFinanceSummary(pool);
    expect(semParte.invoices[0].closes).toBe(false);
    expect(semParte.invoices[0].differenceCents).toBe(100000);
    expect(semParte.warnings.some((w) => w.code === "fatura_nao_fecha")).toBe(true);
  });
});
