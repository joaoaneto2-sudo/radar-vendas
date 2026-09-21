import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../lib/migrations";
import { gravarFotos } from "../../lib/product-photos-db";
import { reconciliarPeca } from "../../lib/vitrine-db";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();
const a = "https://x.blob/a.jpg";
const b = "https://x.blob/b.jpg";
const c = "https://x.blob/c.jpg";
const a2 = "https://x.blob/a-girada.jpg";

describe.skipIf(!disponivel)("fotos da peça: gravar as extras e manter a vitrine", () => {
  let pool: Pool;
  let apagar: () => Promise<void>;
  let peca: number;

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
    await pool.query(`DELETE FROM site_slots`);
    await pool.query(`DELETE FROM products`);
    const { rows } = await pool.query(
      `INSERT INTO products (name, sale_channel, photo_url, show_online, featured, price, public_description, active)
       VALUES ('Anel', 'varejo', $1, true, true, 100, 'Lindo', true) RETURNING id`,
      [a]
    );
    peca = rows[0].id;
  });

  const extras = async () => (await pool.query(`SELECT url FROM product_photos WHERE product_id = $1 ORDER BY position`, [peca])).rows.map((r) => r.url);

  it("grava as extras na ordem da tela", async () => {
    await gravarFotos(pool, peca, { extras: [b, c], trocas: [] });
    expect(await extras()).toEqual([b, c]);
    await gravarFotos(pool, peca, { extras: [c, b], trocas: [] });
    expect(await extras()).toEqual([c, b]);
  });

  it("sem lista, as extras ficam como estão; lista vazia limpa", async () => {
    await gravarFotos(pool, peca, { extras: [b], trocas: [] });
    await gravarFotos(pool, peca, { extras: null, trocas: [] });
    expect(await extras()).toEqual([b]);
    await gravarFotos(pool, peca, { extras: [], trocas: [] });
    expect(await extras()).toEqual([]);
  });

  it("foto girada mantém a vaga do carrossel e da categoria (a vaga passa para o novo endereço)", async () => {
    await pool.query(`INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 0, $1, $2)`, [peca, a]);
    await pool.query(`INSERT INTO site_slots (area, category, position, product_id, photo_url) VALUES ('categoria', 'Anel', 0, $1, $2)`, [peca, a]);
    // a foto de destaque a virou a2 no cadastro
    await pool.query(`UPDATE products SET photo_url = $2 WHERE id = $1`, [peca, a2]);
    await gravarFotos(pool, peca, { extras: [b], trocas: [{ de: a, para: a2 }] });
    const { removidas } = await reconciliarPeca(pool, peca);
    expect(removidas).toEqual([]);
    const { rows } = await pool.query(`SELECT area, photo_url FROM site_slots WHERE product_id = $1 ORDER BY area`, [peca]);
    expect(rows).toEqual([
      { area: "carrossel", photo_url: a2 },
      { area: "categoria", photo_url: a2 },
    ]);
  });

  it("sem a troca, a vaga da foto que saiu é removida (como antes)", async () => {
    await pool.query(`INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 0, $1, $2)`, [peca, b]);
    await gravarFotos(pool, peca, { extras: [c], trocas: [] });
    const { removidas } = await reconciliarPeca(pool, peca);
    expect(removidas).toEqual([{ area: "carrossel", category: null }]);
  });

  it("uma foto extra que vira o destaque continua com a vaga", async () => {
    await gravarFotos(pool, peca, { extras: [b], trocas: [] });
    await pool.query(`INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 0, $1, $2)`, [peca, b]);
    // b passa a ser o destaque e a vira extra
    await pool.query(`UPDATE products SET photo_url = $2 WHERE id = $1`, [peca, b]);
    await gravarFotos(pool, peca, { extras: [a], trocas: [] });
    const { removidas } = await reconciliarPeca(pool, peca);
    expect(removidas).toEqual([]);
    expect(await extras()).toEqual([a]);
  });
});
