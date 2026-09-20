import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

// Vitrine do site: a tabela de vagas (migração 012) e as regras que o próprio banco garante.

const disponivel = await bancoDeTesteDisponivel();

describe.skipIf(!disponivel)("vitrine do site no banco (migração 012)", () => {
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

  async function novaPeca(nome: string): Promise<number> {
    const { rows } = await pool.query(`INSERT INTO products (name, price) VALUES ($1, 100) RETURNING id`, [nome]);
    return rows[0].id;
  }

  it("cria a tabela com as colunas combinadas", async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'site_slots' ORDER BY column_name`
    );
    expect(rows.map((r) => r.column_name)).toEqual(["area", "category", "created_at", "id", "photo_url", "position", "product_id"]);
  });

  it("carrossel: a mesma peça não entra duas vezes", async () => {
    await pool.query(`DELETE FROM products`);
    const a = await novaPeca("A");
    await pool.query(`INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 0, $1, 'https://x/a.jpg')`, [a]);
    await expect(
      pool.query(`INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 1, $1, 'https://x/a2.jpg')`, [a])
    ).rejects.toThrow();
  });

  it("categoria: uma foto escolhida por categoria; mas a mesma peça pode estar no carrossel e numa categoria", async () => {
    await pool.query(`DELETE FROM products`);
    const a = await novaPeca("A");
    const b = await novaPeca("B");
    await pool.query(`INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 0, $1, 'https://x/a.jpg')`, [a]);
    await pool.query(`INSERT INTO site_slots (area, category, product_id, photo_url) VALUES ('categoria', 'Anéis', $1, 'https://x/a.jpg')`, [a]);
    await expect(
      pool.query(`INSERT INTO site_slots (area, category, product_id, photo_url) VALUES ('categoria', 'Anéis', $1, 'https://x/b.jpg')`, [b])
    ).rejects.toThrow();
    await pool.query(`INSERT INTO site_slots (area, category, product_id, photo_url) VALUES ('categoria', 'Brincos', $1, 'https://x/b.jpg')`, [b]);
  });

  it("área e categoria seguem as regras", async () => {
    await pool.query(`DELETE FROM products`);
    const a = await novaPeca("A");
    await expect(pool.query(`INSERT INTO site_slots (area, product_id, photo_url) VALUES ('banner', $1, 'https://x/a.jpg')`, [a])).rejects.toThrow();
    await expect(pool.query(`INSERT INTO site_slots (area, product_id, photo_url) VALUES ('categoria', $1, 'https://x/a.jpg')`, [a])).rejects.toThrow(); // sem categoria
    await expect(pool.query(`INSERT INTO site_slots (area, category, product_id, photo_url) VALUES ('categoria', '  ', $1, 'https://x/a.jpg')`, [a])).rejects.toThrow();
    await expect(pool.query(`INSERT INTO site_slots (area, category, position, product_id, photo_url) VALUES ('carrossel', 'Anéis', 0, $1, 'https://x/a.jpg')`, [a])).rejects.toThrow(); // carrossel não tem categoria
    await expect(pool.query(`INSERT INTO site_slots (area, product_id, photo_url) VALUES ('carrossel', 999999, 'https://x/a.jpg')`)).rejects.toThrow(); // peça inexistente
  });

  it("apagar a peça apaga as vagas dela", async () => {
    await pool.query(`DELETE FROM products`);
    const a = await novaPeca("A");
    await pool.query(`INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 0, $1, 'https://x/a.jpg')`, [a]);
    await pool.query(`INSERT INTO site_slots (area, category, product_id, photo_url) VALUES ('categoria', 'Anéis', $1, 'https://x/a.jpg')`, [a]);
    await pool.query(`DELETE FROM products WHERE id = $1`, [a]);
    expect((await pool.query(`SELECT count(*)::int AS n FROM site_slots`)).rows[0].n).toBe(0);
  });
});
