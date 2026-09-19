import { afterEach, describe, expect, it } from "vitest";
import { LEGACY_BASELINE_STATEMENTS, MIGRATIONS, runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();
const TODOS_OS_IDS = MIGRATIONS.map((m) => m.id);

type Descartavel = Awaited<ReturnType<typeof criarBancoDescartavel>>;
const abertos: Descartavel[] = [];

async function novoBanco() {
  const banco = await criarBancoDescartavel();
  abertos.push(banco);
  return banco;
}

afterEach(async () => {
  while (abertos.length) await abertos.pop()!.apagar();
});

describe.skipIf(!disponivel)("migrações do banco", () => {
  it("num banco vazio, aplica todas as versões, uma vez só", async () => {
    const { pool } = await novoBanco();

    expect(await runMigrations(pool)).toEqual(TODOS_OS_IDS);
    expect(await runMigrations(pool)).toEqual([]); // rodar de novo não faz nada

    const { rows } = await pool.query("SELECT id FROM schema_migrations ORDER BY id");
    expect(rows.map((r) => r.id)).toEqual(TODOS_OS_IDS);
  });

  it("cria as tabelas novas do financeiro", async () => {
    const { pool } = await novoBanco();
    await runMigrations(pool);

    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const tabelas = rows.map((r) => r.table_name);
    for (const esperada of [
      "sales", "clients", "products", "manufacturers", "suppliers", "sellers",
      "agreement_settings", "sale_payments", "consignments", "consignment_items",
      "stock_purchases", "fund_payments", "liabilities", "liability_payments",
      "joao_payments", "users", "login_attempts", "schema_migrations",
    ]) {
      expect(tabelas).toContain(esperada);
    }
  });

  it("os parâmetros do acordo já nascem com as regras combinadas", async () => {
    const { pool } = await novoBanco();
    await runMigrations(pool);

    const { rows } = await pool.query("SELECT * FROM agreement_settings");
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].retail_replenish_pct)).toBe(30);
    expect(Number(rows[0].wholesale_replenish_pct)).toBe(0);
    expect(Number(rows[0].joao_share_pct)).toBe(50);
    expect(Number(rows[0].initial_stock_value)).toBe(15000);
    expect(rows[0].cascade_mode).toBe("recebimento");
  });

  it("banco que já era o do radar antigo (sem histórico) recebe as novidades sem perder dados", async () => {
    const { pool } = await novoBanco();

    // Reproduz o banco real de hoje: tabelas criadas pelo método antigo, sem schema_migrations.
    for (const comando of LEGACY_BASELINE_STATEMENTS) await pool.query(comando);
    await pool.query(
      `INSERT INTO sales (sale_date, client_name, sale_value, payment_method)
       VALUES ('2026-09-01', 'DANIEL ESPOSO DE MICHELE', 590.00, 'Pix à vista')`
    );

    expect(await runMigrations(pool)).toEqual(TODOS_OS_IDS);

    const { rows } = await pool.query(
      `SELECT client_name, sale_value, payment_method, price_tier, status, sale_costs, payment_fee
         FROM sales`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].client_name).toBe("DANIEL ESPOSO DE MICHELE");
    expect(rows[0].sale_value).toBe("590.00");
    expect(rows[0].payment_method).toBe("Pix à vista");
    // Campos novos ganham valores padrão:
    expect(rows[0].price_tier).toBe("varejo");
    expect(rows[0].status).toBe("ativa");
    expect(rows[0].sale_costs).toBe("0.00");
    expect(rows[0].payment_fee).toBe("0.00");
  });

  it("duas cópias do site ligando ao mesmo tempo não brigam", async () => {
    const { pool } = await novoBanco();

    const [a, b] = await Promise.all([runMigrations(pool), runMigrations(pool)]);

    expect(a.length + b.length).toBe(TODOS_OS_IDS.length); // cada versão foi aplicada uma única vez
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM schema_migrations");
    expect(rows[0].n).toBe(TODOS_OS_IDS.length);
  });
});

describe.skipIf(!disponivel)("regras de proteção do banco", () => {
  async function bancoPronto() {
    const { pool } = await novoBanco();
    await runMigrations(pool);
    await pool.query(`INSERT INTO sales (sale_date, sale_value) VALUES ('2026-09-01', 100.00)`);
    return pool;
  }

  it("parcela recebida precisa ter a data do recebimento", async () => {
    const pool = await bancoPronto();
    await expect(
      pool.query(
        `INSERT INTO sale_payments (sale_id, due_date, amount, status) VALUES (1, '2026-09-10', 50, 'recebida')`
      )
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO sale_payments (sale_id, due_date, amount, status, received_date)
         VALUES (1, '2026-09-10', 50, 'recebida', '2026-09-11')`
      )
    ).resolves.toBeDefined();
  });

  it("recusa situação, tipo de preço e valores inválidos", async () => {
    const pool = await bancoPronto();
    await expect(pool.query(`UPDATE sales SET price_tier = 'outro' WHERE id = 1`)).rejects.toThrow();
    await expect(pool.query(`UPDATE sales SET status = 'apagada' WHERE id = 1`)).rejects.toThrow();
    await expect(pool.query(`UPDATE sales SET sale_costs = -1 WHERE id = 1`)).rejects.toThrow();
    await expect(
      pool.query(`INSERT INTO joao_payments (paid_date, amount) VALUES ('2026-09-01', 0)`)
    ).rejects.toThrow();
    await expect(
      pool.query(`INSERT INTO stock_purchases (description, kind, amount) VALUES ('x', 'outra', 10)`)
    ).rejects.toThrow();
    await expect(
      pool.query(`INSERT INTO consignments (out_date) VALUES ('2026-09-01')`)
    ).resolves.toBeDefined();
    await expect(
      pool.query(`INSERT INTO consignment_items (consignment_id, quantity) VALUES (1, 0)`)
    ).rejects.toThrow();
  });

  it("só pode existir uma linha de parâmetros do acordo", async () => {
    const pool = await bancoPronto();
    await expect(pool.query(`INSERT INTO agreement_settings (id) VALUES (2)`)).rejects.toThrow();
  });

  it("apagar uma venda leva junto as parcelas dela", async () => {
    const pool = await bancoPronto();
    await pool.query(`INSERT INTO sale_payments (sale_id, due_date, amount) VALUES (1, '2026-09-10', 100)`);
    await pool.query(`DELETE FROM sales WHERE id = 1`);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM sale_payments");
    expect(rows[0].n).toBe(0);
  });
});
