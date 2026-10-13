import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fabricanteParecido, importarLote, validarLote, type ItemDoLote } from "../../lib/importar-lote";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();

const item = (parte: Partial<ItemDoLote> = {}): ItemDoLote => ({
  fabricante: "Brilhare",
  nome: "Brinco flor em pérola",
  custo: 77,
  categoria: "Brincos",
  fotoPrincipal: "/estoque/brilhare/brinco-close.jpg",
  fotoModelo: "/estoque/brilhare/brinco-modelo.jpg",
  catalogo: { kind: "limpa", fx: 50, fy: 50, zoom: 1 },
  ...parte,
});

describe("validarLote", () => {
  it("aceita um lote certo", () => {
    expect(validarLote({ itens: [item()] }).ok).toBe(true);
  });

  it("recusa lista vazia, custo ruim, categoria ruim, foto ruim e peça repetida", () => {
    expect(validarLote({ itens: [] }).ok).toBe(false);
    expect(validarLote({}).ok).toBe(false);
    expect(validarLote({ itens: [item({ custo: 0 })] }).ok).toBe(false);
    expect(validarLote({ itens: [item({ categoria: "Coisas" })] }).ok).toBe(false);
    expect(validarLote({ itens: [item({ fotoPrincipal: "javascript:alert(1)" })] }).ok).toBe(false);
    expect(validarLote({ itens: [item({ fotoModelo: "ftp://x" })] }).ok).toBe(false);
    expect(validarLote({ itens: [item({ catalogo: { kind: "limpa", fx: 150, fy: 50, zoom: 1 } })] }).ok).toBe(false);
    // mesmo nome, com acento e maiúscula diferentes
    expect(validarLote({ itens: [item(), item({ nome: "BRINCO FLOR EM PEROLA" })] }).ok).toBe(false);
  });
});

describe("fabricanteParecido", () => {
  const lista = [{ name: "CATHARINA DEGAN" }, { name: "Luciana Rangel" }, { name: "Max" }];
  it("acha o fabricante com uma letra de diferença (degan x degam)", () => {
    expect(fabricanteParecido(lista, "catharina degam")?.name).toBe("CATHARINA DEGAN");
  });
  it("nome exato diferente, curto ou ambíguo não é confundido", () => {
    expect(fabricanteParecido(lista, "luciana silva")).toBeUndefined();
    expect(fabricanteParecido(lista, "maxx")).toBeUndefined(); // curto demais
    expect(fabricanteParecido([{ name: "Catharina Degan" }, { name: "Catharina Degao" }], "catharina degam")).toBeUndefined();
  });
});

describe.skipIf(!disponivel)("importar lote de peças das pastas", () => {
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
    await pool.query(`DELETE FROM products WHERE name LIKE 'LT %' OR name = 'Brinco flor em pérola'`);
    await pool.query(`DELETE FROM manufacturers WHERE name IN ('Brilhare', 'Fabricante LT', 'CATHARINA DEGAN', 'Catharina Degam', 'Max', 'Maxx')`);
  });

  it("o ensaio mostra o que faria e não grava nada", async () => {
    const r = await importarLote(pool, [item()], false);
    expect(r).toMatchObject({ gravou: false, criadas: 1, atualizadas: 0, fabricantesCriados: ["Brilhare"] });
    expect((await pool.query(`SELECT count(*)::int AS n FROM products WHERE name = 'Brinco flor em pérola'`)).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM manufacturers WHERE name = 'Brilhare'`)).rows[0].n).toBe(0);
  });

  it("cria fabricante e peça com 1 unidade, preço 2,5x, no catálogo, com as duas fotos", async () => {
    const r = await importarLote(pool, [item()], true);
    expect(r).toMatchObject({ gravou: true, criadas: 1, atualizadas: 0 });
    const { rows } = await pool.query(
      `SELECT p.*, m.name AS fab FROM products p JOIN manufacturers m ON m.id = p.manufacturer_id WHERE p.name = 'Brinco flor em pérola'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fab: "Brilhare", category: "Brincos", stock_qty: 1, sale_channel: "varejo", active: true, show_catalog: true, show_online: false });
    expect(Number(rows[0].cost)).toBe(77);
    expect(Number(rows[0].price)).toBe(192.5);
    expect(rows[0].photo_url).toBe("/estoque/brilhare/brinco-close.jpg");
    expect(rows[0].catalog_photo).toEqual({ kind: "limpa", fx: 50, fy: 50, zoom: 1 });
    const fotos = await pool.query(`SELECT url, kind FROM product_photos WHERE product_id = $1`, [rows[0].id]);
    expect(fotos.rows).toEqual([{ url: "/estoque/brilhare/brinco-modelo.jpg", kind: "modelo" }]);
  });

  it("rodar de novo não duplica: atualiza a mesma peça e troca a foto da modelo", async () => {
    await importarLote(pool, [item()], true);
    const r = await importarLote(pool, [item({ fotoModelo: "/estoque/brilhare/nova-modelo.jpg" })], true);
    expect(r).toMatchObject({ criadas: 0, atualizadas: 1, fabricantesCriados: [] });
    expect((await pool.query(`SELECT count(*)::int AS n FROM products WHERE name = 'Brinco flor em pérola'`)).rows[0].n).toBe(1);
    const fotos = await pool.query(`SELECT url FROM product_photos pp JOIN products p ON p.id = pp.product_id WHERE p.name = 'Brinco flor em pérola'`);
    expect(fotos.rows).toEqual([{ url: "/estoque/brilhare/nova-modelo.jpg" }]);
  });

  it("peça que já existe (mesmo nome, outro acento e maiúscula) ganha fotos e catálogo e não mexe no estoque", async () => {
    const fab = (await pool.query(`INSERT INTO manufacturers (name) VALUES ('Fabricante LT') RETURNING id`)).rows[0].id;
    await pool.query(
      `INSERT INTO products (category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active, show_catalog)
       VALUES ('Brincos', 'LT BRINCO PEROLA', $1, 50, 125, 3, 'varejo', true, false)`,
      [fab]
    );
    const r = await importarLote(pool, [item({ fabricante: "fabricante lt", nome: "LT Brinco Pérola", custo: 50 })], true);
    expect(r).toMatchObject({ criadas: 0, atualizadas: 1, fabricantesCriados: [] });
    expect(r.itens[0].aviso).toBeUndefined();
    const { rows } = await pool.query(`SELECT cost, price, stock_qty, show_catalog, photo_url FROM products WHERE name = 'LT BRINCO PEROLA'`);
    expect(Number(rows[0].cost)).toBe(50);
    expect(Number(rows[0].price)).toBe(125);
    expect(rows[0].stock_qty).toBe(3);
    expect(rows[0].show_catalog).toBe(true);
    expect(rows[0].photo_url).toBe("/estoque/brilhare/brinco-close.jpg");
  });

  it("custo da pasta diferente: atualiza o custo e refaz o preço (2,5x) quando o preço seguia a regra", async () => {
    const fab = (await pool.query(`INSERT INTO manufacturers (name) VALUES ('Fabricante LT') RETURNING id`)).rows[0].id;
    await pool.query(
      `INSERT INTO products (category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active) VALUES ('Pulseiras', 'LT Pulseira', $1, 140, 350, 2, 'varejo', true)`,
      [fab]
    );
    const r = await importarLote(pool, [item({ fabricante: "Fabricante LT", nome: "LT Pulseira", custo: 169, categoria: "Pulseiras" })], true);
    expect(r.itens[0].aviso).toContain("custo atualizado de 140.00 para 169.00 e preço de 350.00 para 422.50");
    const { rows } = await pool.query(`SELECT cost, price, stock_qty FROM products WHERE name = 'LT Pulseira'`);
    expect([Number(rows[0].cost), Number(rows[0].price), rows[0].stock_qty]).toEqual([169, 422.5, 2]);
  });

  it("custo da pasta diferente com preço definido à mão: atualiza só o custo e avisa", async () => {
    const fab = (await pool.query(`INSERT INTO manufacturers (name) VALUES ('Fabricante LT') RETURNING id`)).rows[0].id;
    await pool.query(
      `INSERT INTO products (category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active) VALUES ('Brincos', 'LT Brinco manual', $1, 50, 140, 1, 'varejo', true)`,
      [fab]
    );
    const r = await importarLote(pool, [item({ fabricante: "Fabricante LT", nome: "LT Brinco manual", custo: 60 })], true);
    expect(r.itens[0].aviso).toContain("não seguia o 2,5");
    const { rows } = await pool.query(`SELECT cost, price FROM products WHERE name = 'LT Brinco manual'`);
    expect([Number(rows[0].cost), Number(rows[0].price)]).toEqual([60, 140]);
  });

  it("peça nova com o mesmo custo de outra do mesmo fabricante gera aviso de possível duplicada", async () => {
    const fab = (await pool.query(`INSERT INTO manufacturers (name) VALUES ('Fabricante LT') RETURNING id`)).rows[0].id;
    await pool.query(
      `INSERT INTO products (category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active) VALUES ('Pulseiras', 'LT Bracelete são Bento', $1, 155, 387.5, 1, 'varejo', true)`,
      [fab]
    );
    const r = await importarLote(pool, [item({ fabricante: 'Fabricante LT', nome: 'LT Bracelete Dourado de São Bento', custo: 155, categoria: 'Pulseiras' })], false);
    expect(r.criadas).toBe(1);
    expect(r.itens[0].aviso).toContain('LT Bracelete são Bento');
  });

  it("fabricante já cadastrado com uma letra diferente (Degan x Degam) é reaproveitado, sem criar outro", async () => {
    await pool.query(`INSERT INTO manufacturers (name) VALUES ('CATHARINA DEGAN')`);
    const r = await importarLote(pool, [item({ fabricante: "Catharina Degam", nome: "LT Colar crochê", custo: 378, categoria: "Colares e Correntes" })], true);
    expect(r.fabricantesCriados).toEqual([]);
    expect(r.fabricantesParecidos).toEqual([{ pasta: "Catharina Degam", existente: "CATHARINA DEGAN" }]);
    const { rows } = await pool.query(`SELECT m.name FROM products p JOIN manufacturers m ON m.id = p.manufacturer_id WHERE p.name = 'LT Colar crochê'`);
    expect(rows[0].name).toBe("CATHARINA DEGAN");
    expect((await pool.query(`SELECT count(*)::int AS n FROM manufacturers WHERE name ILIKE 'catharina deg%'`)).rows[0].n).toBe(1);
  });

  it("peça com uma foto só não deixa foto de modelo para trás", async () => {
    await importarLote(pool, [item()], true);
    await importarLote(pool, [item({ fotoModelo: null, catalogo: { kind: "modelo", fx: 50, fy: 50, zoom: 1.4 } })], true);
    const fotos = await pool.query(`SELECT 1 FROM product_photos pp JOIN products p ON p.id = pp.product_id WHERE p.name = 'Brinco flor em pérola'`);
    expect(fotos.rowCount).toBe(0);
  });

  it("se algo falha no meio, nada é gravado", async () => {
    const ruim = item({ nome: "LT Segunda", categoria: "Brincos", catalogo: { kind: "limpa", fx: 50, fy: 50, zoom: 1 } });
    // custo gigante estoura a coluna NUMERIC(12,2) no segundo item
    await expect(importarLote(pool, [item({ nome: "LT Primeira" }), { ...ruim, custo: 1e15 }], true)).rejects.toThrow();
    expect((await pool.query(`SELECT count(*)::int AS n FROM products WHERE name LIKE 'LT %'`)).rows[0].n).toBe(0);
  });
});
