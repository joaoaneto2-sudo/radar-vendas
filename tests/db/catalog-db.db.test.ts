import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  gravarCodigoFabricante,
  gravarTipoDaFoto,
  mudarDisponibilidade,
  mudarNoCatalogo,
} from "../../lib/catalog-db";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

// Acesso ao banco do catálogo online (migração 017): marcar/desmarcar no catálogo, mudar a
// disponibilidade, gravar o código do fabricante e o tipo de cada foto. Sem rotas de API ainda.

const disponivel = await bancoDeTesteDisponivel();

describe.skipIf(!disponivel)("lib/catalog-db", () => {
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
    await pool.query(`DELETE FROM products`);
    await pool.query(`DELETE FROM manufacturers`);
    const { rows } = await pool.query(
      `INSERT INTO products (name, price, sale_channel) VALUES ('Anel', 100, 'varejo') RETURNING id`
    );
    peca = rows[0].id;
  });

  describe("mudarNoCatalogo", () => {
    it("marca a peça no catálogo com uma posição", async () => {
      const ok = await mudarNoCatalogo(pool, peca, { showCatalog: true, catalogPosition: 3 });
      expect(ok).toBe(true);
      const { rows } = await pool.query(`SELECT show_catalog, catalog_position FROM products WHERE id = $1`, [peca]);
      expect(rows[0]).toEqual({ show_catalog: true, catalog_position: 3 });
    });

    it("desmarca sem mudar a posição quando só showCatalog vem", async () => {
      await mudarNoCatalogo(pool, peca, { showCatalog: true, catalogPosition: 5 });
      await mudarNoCatalogo(pool, peca, { showCatalog: false });
      const { rows } = await pool.query(`SELECT show_catalog, catalog_position FROM products WHERE id = $1`, [peca]);
      expect(rows[0]).toEqual({ show_catalog: false, catalog_position: 5 });
    });

    it("aceita catalogPosition nulo (ordem de cadastro)", async () => {
      await mudarNoCatalogo(pool, peca, { showCatalog: true, catalogPosition: 2 });
      await mudarNoCatalogo(pool, peca, { catalogPosition: null });
      const { rows } = await pool.query(`SELECT show_catalog, catalog_position FROM products WHERE id = $1`, [peca]);
      expect(rows[0]).toEqual({ show_catalog: true, catalog_position: null });
    });

    it("peça de atacado não pode ir para o catálogo (o banco recusa)", async () => {
      const { rows } = await pool.query(
        `INSERT INTO products (name, price, sale_channel) VALUES ('Da Bia', 100, 'atacado') RETURNING id`
      );
      await expect(mudarNoCatalogo(pool, rows[0].id, { showCatalog: true })).rejects.toThrow();
    });

    it("peça que não existe: devolve false", async () => {
      expect(await mudarNoCatalogo(pool, 999999, { showCatalog: true })).toBe(false);
    });
  });

  describe("mudarDisponibilidade", () => {
    it("muda para encomenda e de volta para pronta entrega", async () => {
      expect(await mudarDisponibilidade(pool, peca, "encomenda")).toBe(true);
      expect((await pool.query(`SELECT availability FROM products WHERE id = $1`, [peca])).rows[0].availability).toBe(
        "encomenda"
      );
      await mudarDisponibilidade(pool, peca, "pronta_entrega");
      expect((await pool.query(`SELECT availability FROM products WHERE id = $1`, [peca])).rows[0].availability).toBe(
        "pronta_entrega"
      );
    });

    it("peça que não existe: devolve false", async () => {
      expect(await mudarDisponibilidade(pool, 999999, "encomenda")).toBe(false);
    });
  });

  describe("gravarCodigoFabricante", () => {
    it("grava e depois apaga o código (null)", async () => {
      expect(await gravarCodigoFabricante(pool, peca, "023612809015")).toBe(true);
      expect((await pool.query(`SELECT manufacturer_code FROM products WHERE id = $1`, [peca])).rows[0].manufacturer_code).toBe(
        "023612809015"
      );
      await gravarCodigoFabricante(pool, peca, null);
      expect((await pool.query(`SELECT manufacturer_code FROM products WHERE id = $1`, [peca])).rows[0].manufacturer_code).toBeNull();
    });

    it("código repetido no mesmo fabricante dá erro do Postgres (constraint única)", async () => {
      const { rows: fabs } = await pool.query(`INSERT INTO manufacturers (name) VALUES ('Zarpellon') RETURNING id`);
      const fabricanteId = fabs[0].id;
      await pool.query(`UPDATE products SET manufacturer_id = $1 WHERE id = $2`, [fabricanteId, peca]);
      const { rows: outra } = await pool.query(
        `INSERT INTO products (name, price, manufacturer_id) VALUES ('Outra peça', 100, $1) RETURNING id`,
        [fabricanteId]
      );
      await gravarCodigoFabricante(pool, peca, "111");
      await expect(gravarCodigoFabricante(pool, outra[0].id, "111")).rejects.toMatchObject({ code: "23505" });
    });

    it("peça que não existe: devolve false", async () => {
      expect(await gravarCodigoFabricante(pool, 999999, "1")).toBe(false);
    });
  });

  describe("gravarTipoDaFoto", () => {
    let fotoId: number;
    beforeEach(async () => {
      const { rows } = await pool.query(
        `INSERT INTO product_photos (product_id, url) VALUES ($1, 'https://x/1.jpg') RETURNING id`,
        [peca]
      );
      fotoId = rows[0].id;
    });

    it("grava limpa, depois modelo, depois volta para sem tipo (null)", async () => {
      expect(await gravarTipoDaFoto(pool, fotoId, "limpa")).toBe(true);
      expect((await pool.query(`SELECT kind FROM product_photos WHERE id = $1`, [fotoId])).rows[0].kind).toBe("limpa");
      await gravarTipoDaFoto(pool, fotoId, "modelo");
      expect((await pool.query(`SELECT kind FROM product_photos WHERE id = $1`, [fotoId])).rows[0].kind).toBe("modelo");
      await gravarTipoDaFoto(pool, fotoId, null);
      expect((await pool.query(`SELECT kind FROM product_photos WHERE id = $1`, [fotoId])).rows[0].kind).toBeNull();
    });

    it("foto que não existe: devolve false", async () => {
      expect(await gravarTipoDaFoto(pool, 999999, "limpa")).toBe(false);
    });
  });
});
