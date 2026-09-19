import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getFinanceSummary } from "../../lib/finance/load";
import { runMigrations } from "../../lib/migrations";
import { parseSaleFinance } from "../../lib/sale-finance";
import { SALE_SELECT, cashbackBalanceCents, resolveIncentive, savePayments } from "../../lib/sales-query";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

// Cadastro da venda: parcelas gravadas junto, consulta que devolve parcelas e comissão,
// e o efeito de cada modalidade nas contas do financeiro.

const disponivel = await bancoDeTesteDisponivel();

describe.skipIf(!disponivel)("cadastro de venda no banco", () => {
  let pool: Pool;
  let apagar: () => Promise<void>;

  beforeAll(async () => {
    const banco = await criarBancoDescartavel();
    pool = banco.pool;
    apagar = banco.apagar;
    await runMigrations(pool);
    await pool.query(
      `INSERT INTO manufacturers (name, represented, commission_pct, commission_days) VALUES
         ('Bia Belutti', true, 20, 15),
         ('Fabricante comum', false, NULL, 15)`
    );
  });

  afterAll(async () => {
    await apagar?.();
  });

  async function gravarParcelas(saleId: number, corpo: Record<string, unknown>) {
    const fin = parseSaleFinance(corpo);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (fin.payments) await savePayments(client, saleId, fin.payments);
      await client.query("COMMIT");
    } catch (erro) {
      await client.query("ROLLBACK");
      throw erro;
    } finally {
      client.release();
    }
  }

  it("Pix a prazo: as parcelas voltam com a venda, com datas em texto e valores em número", async () => {
    const { rows } = await pool.query(
      `INSERT INTO sales (sale_date, client_name, sale_value, payment_method, price_tier)
       VALUES ('2026-09-17', 'Cliente Pix', 280, 'Pix a prazo', 'varejo') RETURNING id`
    );
    const id = rows[0].id;
    await gravarParcelas(id, {
      sale_date: "2026-09-17",
      price_tier: "varejo",
      payments: [
        { due_date: "2026-10-17", amount: "140", received: false },
        { due_date: "2026-09-20", amount: "140", received: true, received_date: "2026-09-19" },
      ],
    });

    const { rows: venda } = await pool.query(`${SALE_SELECT} WHERE s.id = $1`, [id]);
    expect(venda[0].payments).toEqual([
      expect.objectContaining({ due_date: "2026-09-20", amount: 140, status: "recebida", received_date: "2026-09-19" }),
      expect.objectContaining({ due_date: "2026-10-17", amount: 140, status: "prevista", received_date: null }),
    ]);
    expect(venda[0].commission_pct).toBeNull();
  });

  it("salvar de novo troca as parcelas (não duplica) e uma lista vazia limpa tudo", async () => {
    const { rows } = await pool.query(`INSERT INTO sales (sale_date, sale_value) VALUES ('2026-09-17', 100) RETURNING id`);
    const id = rows[0].id;
    await gravarParcelas(id, { payments: [{ due_date: "2026-10-01", amount: "50" }, { due_date: "2026-11-01", amount: "50" }] });
    await gravarParcelas(id, { payments: [{ due_date: "2026-12-01", amount: "100" }] });
    expect((await pool.query(`SELECT count(*)::int AS n FROM sale_payments WHERE sale_id = $1`, [id])).rows[0].n).toBe(1);
    await gravarParcelas(id, { payments: [] });
    expect((await pool.query(`SELECT count(*)::int AS n FROM sale_payments WHERE sale_id = $1`, [id])).rows[0].n).toBe(0);
  });

  it("se algo der errado no meio, nenhuma parcela é trocada pela metade", async () => {
    const { rows } = await pool.query(`INSERT INTO sales (sale_date, sale_value) VALUES ('2026-09-17', 100) RETURNING id`);
    const id = rows[0].id;
    await gravarParcelas(id, { payments: [{ due_date: "2026-10-01", amount: "100" }] });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await expect(
        savePayments(client, id, [
          { due_date: "2026-11-01", amount: 60, status: "prevista", received_date: null },
          // recebida sem data: o banco recusa, e a troca inteira deve ser desfeita
          { due_date: "2026-12-01", amount: 40, status: "recebida", received_date: null },
        ])
      ).rejects.toThrow();
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    const { rows: restantes } = await pool.query(`SELECT to_char(due_date, 'YYYY-MM-DD') AS d FROM sale_payments WHERE sale_id = $1`, [id]);
    expect(restantes).toEqual([{ d: "2026-10-01" }]);
  });

  it("atacado: a consulta traz a comissão do fabricante representado, e nada de comissão para o comum", async () => {
    const { rows } = await pool.query(
      `INSERT INTO sales (sale_date, client_name, sale_value, price_tier, manufacturer_id, stock_received_date)
       VALUES ('2026-09-12', 'Revendedora Ana', 1500, 'atacado',
               (SELECT id FROM manufacturers WHERE name = 'Bia Belutti'), '2026-09-14'),
              ('2026-09-12', 'Revendedora Bia', 1000, 'atacado',
               (SELECT id FROM manufacturers WHERE name = 'Fabricante comum'), NULL)
       RETURNING id`
    );
    const { rows: ana } = await pool.query(`${SALE_SELECT} WHERE s.id = $1`, [rows[0].id]);
    expect(ana[0]).toMatchObject({ manufacturer_ref_name: "Bia Belutti", stock_received_date: "2026-09-14" });
    expect(Number(ana[0].commission_pct)).toBe(20);
    expect(ana[0].payments).toEqual([]);

    const { rows: comum } = await pool.query(`${SALE_SELECT} WHERE s.id = $1`, [rows[1].id]);
    expect(comum[0].commission_pct).toBeNull();
    expect(comum[0].stock_received_date).toBeNull();
  });

  it("efeito nas contas: varejo com custos e taxa, e Pix a prazo só entra quando recebido", async () => {
    await pool.query(`DELETE FROM sales`);
    // Varejo de R$ 1.000 com R$ 20 de custos e R$ 30 de taxa: reposição 300, lucro 650.
    await pool.query(
      `INSERT INTO sales (sale_date, sale_value, payment_method, price_tier, sale_costs, payment_fee)
       VALUES ('2026-09-10', 1000, 'Link de pagamento', 'varejo', 20, 30)`
    );
    // Pix a prazo de R$ 400: uma parcela recebida, outra ainda prevista.
    const { rows } = await pool.query(
      `INSERT INTO sales (sale_date, sale_value, payment_method, price_tier)
       VALUES ('2026-09-11', 400, 'Pix a prazo', 'consignado') RETURNING id`
    );
    await gravarParcelas(rows[0].id, {
      sale_date: "2026-09-11",
      payments: [
        { due_date: "2026-09-15", amount: "200", received: true, received_date: "2026-09-16" },
        { due_date: "2026-10-15", amount: "200" },
      ],
    });

    const r = await getFinanceSummary(pool, { today: "2026-09-19" });
    expect(r.cascade.totals.soldCents).toBe(140000);
    expect(r.cascade.totals.countedCents).toBe(100000 + 20000); // só a parcela recebida entrou
    expect(r.cascade.totals.pendingCents).toBe(20000);
    expect(r.cascade.totals.costsCents).toBe(5000);
    expect(r.cascade.totals.replenishCents).toBe(30000 + 6000); // 30% do varejo e 30% da parcela consignada
    expect(r.cascade.check.fernandaPlusJoaoEqualsDistributable).toBe(true);
  });

  it("desconto e cashback: proteções do banco", async () => {
    await expect(pool.query(`INSERT INTO sales (sale_date, discount_pct) VALUES ('2026-09-01', 101)`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO sales (sale_date, cashback_pct) VALUES ('2026-09-01', -1)`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO sales (sale_date, cashback_used) VALUES ('2026-09-01', -5)`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO sales (sale_date, gross_value, discount_pct) VALUES ('2026-09-01', 200, 10)`)).resolves.toBeDefined();
  });

  it("cashback: o cliente ganha na venda, usa depois (nunca mais que o saldo) e o saldo acompanha", async () => {
    await pool.query(`DELETE FROM sales`);
    const { rows: cli } = await pool.query(`INSERT INTO clients (full_name) VALUES ('Maria Cashback') RETURNING id`);
    const clientId = cli[0].id as number;

    // Venda 1: R$ 200 com 10% de cashback: paga 200 e ganha 20.
    const v1 = await resolveIncentive(
      pool,
      { gross_value: "200", incentive_kind: "cashback", incentive_pct: "10", price_tier: "varejo" },
      clientId,
      null
    );
    expect(v1).toMatchObject({ saleValue: 200, cashbackEarned: 20, cashbackPct: 10, grossValue: 200 });
    await pool.query(
      `INSERT INTO sales (sale_date, client_id, sale_value, gross_value, cashback_pct, cashback_earned)
       VALUES ('2026-09-10', $1, 200, 200, 10, 20)`,
      [clientId]
    );
    expect(await cashbackBalanceCents(pool, clientId)).toBe(2000);

    // Venda 2: tenta usar R$ 50, mas o saldo é só R$ 20; com 5% de desconto.
    const v2 = await resolveIncentive(
      pool,
      { gross_value: "100", incentive_kind: "desconto", incentive_pct: "5", cashback_used: "50", price_tier: "varejo" },
      clientId,
      null
    );
    expect(v2).toMatchObject({ cashbackUsed: 20, discountPct: 5, saleValue: 100 - 5 - 20 });
    const { rows: v2row } = await pool.query(
      `INSERT INTO sales (sale_date, client_id, sale_value, gross_value, discount_pct, cashback_used)
       VALUES ('2026-09-12', $1, 75, 100, 5, 20) RETURNING id`,
      [clientId]
    );
    expect(await cashbackBalanceCents(pool, clientId)).toBe(0);

    // Editando a venda 2, o saldo não conta o que ela mesma usou: dá para manter os R$ 20.
    expect(await cashbackBalanceCents(pool, clientId, v2row[0].id)).toBe(2000);
    const edicao = await resolveIncentive(
      pool,
      { gross_value: "100", incentive_kind: "nenhum", cashback_used: "20", price_tier: "varejo" },
      clientId,
      v2row[0].id
    );
    expect(edicao).toMatchObject({ cashbackUsed: 20, saleValue: 80, grossValue: 100, discountPct: null });

    // Venda cancelada não conta no saldo.
    await pool.query(`UPDATE sales SET status = 'cancelada' WHERE client_id = $1 AND cashback_earned > 0`, [clientId]);
    expect(await cashbackBalanceCents(pool, clientId)).toBe(0);

    // Sem cliente escolhido, nada pode ser usado; e sem o bloco, nada muda.
    const semCliente = await resolveIncentive(pool, { gross_value: "100", cashback_used: "30", price_tier: "varejo" }, null, null);
    expect(semCliente).toMatchObject({ cashbackUsed: 0, saleValue: 100, grossValue: null });
    expect(await resolveIncentive(pool, { sale_value: "100" }, clientId, null)).toBeNull();
    // Atacado nunca tem desconto nem cashback.
    const atac = await resolveIncentive(
      pool,
      { gross_value: "1000", incentive_kind: "desconto", incentive_pct: "10", price_tier: "atacado" },
      clientId,
      null
    );
    expect(atac).toMatchObject({ saleValue: 1000, discountPct: null, grossValue: null });
  });
});
