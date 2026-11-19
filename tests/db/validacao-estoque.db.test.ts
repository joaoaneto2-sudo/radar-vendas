import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listarParaValidar, listarQueSairam, marcarValidacao } from "../../lib/validacao-estoque-db";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

// Validação de Estoque (migração 024): V, X e voltar, e o que cada um faz no estoque e no catálogo.

const disponivel = await bancoDeTesteDisponivel();

describe.skipIf(!disponivel)("lib/validacao-estoque-db", () => {
  let pool: Pool;
  let apagar: () => Promise<void>;
  let peca: number;
  let atacado: number;

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
    const { rows: f } = await pool.query(`INSERT INTO manufacturers (name) VALUES ('Zarpellon') RETURNING id`);
    const { rows } = await pool.query(
      `INSERT INTO products (name, price, sale_channel, stock_qty, show_catalog, photo_url, manufacturer_id, foto_origem)
       VALUES ('Anel cristal', 100, 'varejo', 3, true, 'https://x/anel.jpg', $1, '1234|5678') RETURNING id`,
      [f[0].id]
    );
    peca = rows[0].id;
    const { rows: a } = await pool.query(
      `INSERT INTO products (name, price, sale_channel, stock_qty, photo_url) VALUES ('Brinco atacado', 50, 'atacado', 1, 'https://x/b.jpg') RETURNING id`
    );
    atacado = a[0].id;
  });

  const estado = async () =>
    (await pool.query(`SELECT stock_qty, show_catalog, validacao, validado_em FROM products WHERE id = $1`, [peca])).rows[0];

  it("lista só as nossas peças com foto (atacado fica de fora)", async () => {
    const lista = await listarParaValidar(pool);
    expect(lista.map((p) => p.id)).toEqual([peca]);
    expect(lista[0]).toMatchObject({ nome: "Anel cristal", fabricante: "Zarpellon", foto: "https://x/anel.jpg", validacao: null });
  });

  it("X tira do catálogo e zera o estoque; voltar devolve como estava", async () => {
    expect(await marcarValidacao(pool, peca, "saiu")).toBe(true);
    expect(await estado()).toMatchObject({ stock_qty: 0, show_catalog: false, validacao: "saiu" });
    expect((await listarQueSairam(pool)).map((p) => [p.id, p.fabricante, p.fotoOrigem])).toEqual([[peca, "Zarpellon", "1234|5678"]]);

    expect(await marcarValidacao(pool, peca, null)).toBe(true);
    const depois = await estado();
    expect(depois).toMatchObject({ stock_qty: 3, show_catalog: true, validacao: null, validado_em: null });
    expect(await listarQueSairam(pool)).toEqual([]);
  });

  it("V não mexe no estoque nem no catálogo; trocar X por V devolve o estoque", async () => {
    await marcarValidacao(pool, peca, "tem");
    expect(await estado()).toMatchObject({ stock_qty: 3, show_catalog: true, validacao: "tem" });
    await marcarValidacao(pool, peca, "saiu");
    await marcarValidacao(pool, peca, "saiu"); // repetir o X não perde o estado de antes
    await marcarValidacao(pool, peca, "tem");
    expect(await estado()).toMatchObject({ stock_qty: 3, show_catalog: true, validacao: "tem" });
  });

  it("não marca peça de atacado nem peça que não existe", async () => {
    expect(await marcarValidacao(pool, atacado, "saiu")).toBe(false);
    expect(await marcarValidacao(pool, 999999, "tem")).toBe(false);
  });
});
