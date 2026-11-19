import { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardarFoto, lerFoto, trocarFotosQuebradas } from "../../lib/fotos-guardadas";
import { importarLote } from "../../lib/importar-lote";
import { marcarValidacao } from "../../lib/validacao-estoque-db";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

// Fotos guardadas no banco (migração 025) e o reenvio de fotos sem devolver ao catálogo a peça que saiu.

const disponivel = await bancoDeTesteDisponivel();

describe.skipIf(!disponivel)("fotos guardadas no banco", () => {
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

  it("guarda a foto reduzida em JPEG e devolve o endereço /api/foto/<id>", async () => {
    const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#b0102a" } }).png().toBuffer();
    const url = await guardarFoto(pool, png);
    expect(url).toMatch(/^\/api\/foto\/\d+$/);
    const foto = await lerFoto(pool, Number(url.split("/").pop()));
    expect(foto?.tipo).toBe("image/jpeg");
    const meta = await sharp(foto!.conteudo).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1600, 1067]);
    expect(await lerFoto(pool, 999999)).toBeNull();
  });

  it("reenviar a foto de uma peça marcada com X troca a foto mas não a devolve ao catálogo", async () => {
    await importarLote(pool, [{ fabricante: "Zarpellon", nome: "Anel", categoria: "Anéis", custo: 10, fotoPrincipal: "/api/foto/1" }], true);
    const { rows } = await pool.query(`SELECT id FROM products WHERE name = 'Anel'`);
    const id = rows[0].id;
    await marcarValidacao(pool, id, "saiu");
    await importarLote(pool, [{ fabricante: "Zarpellon", nome: "Anel", categoria: "Anéis", custo: 10, fotoPrincipal: "/api/foto/2" }], true);
    const { rows: depois } = await pool.query(`SELECT photo_url, show_catalog, stock_qty FROM products WHERE id = $1`, [id]);
    expect(depois[0]).toEqual({ photo_url: "/api/foto/2", show_catalog: false, stock_qty: 0 });
  });
});

describe.skipIf(!disponivel)("trocar fotos quebradas", () => {
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

  it("troca só a foto e a modelo que estavam no depósito bloqueado", async () => {
    const quebrada = "https://abc.public.blob.vercel-storage.com/produtos/x.jpg";
    const { rows } = await pool.query(
      `INSERT INTO products (name, price, sale_channel, stock_qty, photo_url) VALUES ('A', 10, 'varejo', 2, $1), ('B', 10, 'varejo', 1, '/estoque/b.jpg') RETURNING id`,
      [quebrada]
    );
    const [a, b] = rows.map((r) => r.id);
    await pool.query(`INSERT INTO product_photos (product_id, url, kind, position) VALUES ($1, $2, 'modelo', 0)`, [a, quebrada.replace("x", "y")]);
    const r = await trocarFotosQuebradas(pool, [
      { id: a, foto: "/api/foto/1", modelo: "/api/foto/2" },
      { id: b, foto: "/api/foto/3" },
    ]);
    expect(r).toEqual({ fotos: 1, modelos: 1 });
    const { rows: depois } = await pool.query(`SELECT id, photo_url, stock_qty FROM products ORDER BY id`);
    expect(depois).toEqual([
      { id: a, photo_url: "/api/foto/1", stock_qty: 2 },
      { id: b, photo_url: "/estoque/b.jpg", stock_qty: 1 },
    ]);
    const { rows: m } = await pool.query(`SELECT url FROM product_photos WHERE product_id = $1`, [a]);
    expect(m[0].url).toBe("/api/foto/2");
  });
});
