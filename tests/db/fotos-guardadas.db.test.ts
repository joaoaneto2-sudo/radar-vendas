import { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardarFoto, lerFoto } from "../../lib/fotos-guardadas";
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
