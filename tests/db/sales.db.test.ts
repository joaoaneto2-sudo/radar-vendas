import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getFinanceSummary } from "../../lib/finance/load";
import { runMigrations } from "../../lib/migrations";
import { parseSaleFinance } from "../../lib/sale-finance";
import { SALE_SELECT, savePayments } from "../../lib/sales-query";
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
});
