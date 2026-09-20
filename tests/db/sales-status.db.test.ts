import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../lib/migrations";
import { mudarStatusDaVenda } from "../../lib/sales-status-db";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

// Cancelar e reativar venda: muda o status, e a peça sai/volta do estoque.

const disponivel = await bancoDeTesteDisponivel();

describe.skipIf(!disponivel)("cancelar e reativar venda", () => {
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
    await pool.query(`DELETE FROM sales`);
    await pool.query(`DELETE FROM products`);
  });

  async function peca(estoque: number): Promise<number> {
    const { rows } = await pool.query(`INSERT INTO products (name, price, stock_qty) VALUES ('Anel', 100, $1) RETURNING id`, [estoque]);
    return rows[0].id;
  }

  async function venda(productId: number | null, tier = "varejo"): Promise<number> {
    const { rows } = await pool.query(
      `INSERT INTO sales (sale_date, sale_value, client_name, product_id, price_tier) VALUES ('2026-09-10', 100, 'Ana', $1, $2) RETURNING id`,
      [productId, tier]
    );
    return rows[0].id;
  }

  const estoqueDe = async (id: number) => (await pool.query(`SELECT stock_qty FROM products WHERE id = $1`, [id])).rows[0].stock_qty;
  const statusDe = async (id: number) => (await pool.query(`SELECT status, cancelled_at FROM sales WHERE id = $1`, [id])).rows[0];

  it("cancelar: muda o status, marca a data e devolve a peça ao estoque", async () => {
    const p = await peca(2);
    const v = await venda(p);
    const r = await mudarStatusDaVenda(pool, v, "cancelada");
    expect(r).toMatchObject({ ok: true, mudou: true, recebidoCents: 0 });
    const s = await statusDe(v);
    expect(s.status).toBe("cancelada");
    expect(s.cancelled_at).not.toBeNull();
    expect(await estoqueDe(p)).toBe(3);
  });

  it("reativar: volta a ativa, limpa a data e a peça sai do estoque de novo", async () => {
    const p = await peca(2);
    const v = await venda(p);
    await mudarStatusDaVenda(pool, v, "cancelada");
    const r = await mudarStatusDaVenda(pool, v, "ativa");
    expect(r).toMatchObject({ ok: true, mudou: true });
    const s = await statusDe(v);
    expect(s.status).toBe("ativa");
    expect(s.cancelled_at).toBeNull();
    expect(await estoqueDe(p)).toBe(2);
  });

  it("reativar com o estoque zerado não deixa o estoque negativo", async () => {
    const p = await peca(0);
    const v = await venda(p);
    await pool.query(`UPDATE sales SET status = 'cancelada', cancelled_at = now() WHERE id = $1`, [v]);
    await mudarStatusDaVenda(pool, v, "ativa");
    expect(await estoqueDe(p)).toBe(0);
  });

  it("pedir o status que a venda já tem não muda nada (nem o estoque)", async () => {
    const p = await peca(2);
    const v = await venda(p);
    expect(await mudarStatusDaVenda(pool, v, "ativa")).toMatchObject({ ok: true, mudou: false });
    await mudarStatusDaVenda(pool, v, "cancelada");
    expect(await mudarStatusDaVenda(pool, v, "cancelada")).toMatchObject({ ok: true, mudou: false });
    expect(await estoqueDe(p)).toBe(3); // só uma devolução, não duas
  });

  it("venda de atacado não mexe no estoque (a peça é do fabricante)", async () => {
    const p = await peca(5);
    const v = await venda(p, "atacado");
    await mudarStatusDaVenda(pool, v, "cancelada");
    expect(await estoqueDe(p)).toBe(5);
  });

  it("venda sem peça cadastrada só muda o status", async () => {
    const v = await venda(null);
    expect(await mudarStatusDaVenda(pool, v, "cancelada")).toMatchObject({ ok: true, mudou: true });
    expect((await statusDe(v)).status).toBe("cancelada");
  });

  it("avisa quanto já tinha sido recebido da venda", async () => {
    const v = await venda(null);
    await pool.query(
      `INSERT INTO sale_payments (sale_id, due_date, amount, status, received_date) VALUES
         ($1, '2026-09-10', 40.50, 'recebida', '2026-09-10'),
         ($1, '2026-10-10', 59.50, 'prevista', NULL)`,
      [v]
    );
    expect(await mudarStatusDaVenda(pool, v, "cancelada")).toMatchObject({ ok: true, recebidoCents: 4050 });
  });

  it("venda que não existe", async () => {
    expect(await mudarStatusDaVenda(pool, 999999, "cancelada")).toEqual({ ok: false, error: "not_found" });
  });
});
