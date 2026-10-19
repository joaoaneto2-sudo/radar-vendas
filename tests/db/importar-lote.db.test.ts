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
    expect(validarLote({ itens: [item({ codigo: "abc" })] }).ok).toBe(false);
    expect(validarLote({ itens: [item({ codigo: "SIMONEJÓ-BR-001" })] }).ok).toBe(true);
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

  it("custo da pasta diferente do cadastro: não sobrescreve, guarda em custo_da_pasta e avisa", async () => {
    const fab = (await pool.query(`INSERT INTO manufacturers (name) VALUES ('Fabricante LT') RETURNING id`)).rows[0].id;
    await pool.query(
      `INSERT INTO products (category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active) VALUES ('Pulseiras', 'LT Pulseira', $1, 140, 350, 2, 'varejo', true)`,
      [fab]
    );
    const r = await importarLote(pool, [item({ fabricante: "Fabricante LT", nome: "LT Pulseira", custo: 169, categoria: "Pulseiras" })], true);
    expect(r.itens[0].aviso).toContain("custo diverge: cadastro 140.00 e pasta 169.00");
    expect(r.itens[0].aviso).toContain("Custo diverge da pasta");
    const { rows } = await pool.query(`SELECT cost, price, stock_qty, custo_da_pasta FROM products WHERE name = 'LT Pulseira'`);
    expect([Number(rows[0].cost), Number(rows[0].price), rows[0].stock_qty, Number(rows[0].custo_da_pasta)]).toEqual([140, 350, 2, 169]);
  });

  it("quando a pasta volta a bater com o cadastro, a dúvida some", async () => {
    const fab = (await pool.query(`INSERT INTO manufacturers (name) VALUES ('Fabricante LT') RETURNING id`)).rows[0].id;
    await pool.query(
      `INSERT INTO products (category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active, custo_da_pasta) VALUES ('Brincos', 'LT Brinco duvida', $1, 60, 150, 1, 'varejo', true, 70)`,
      [fab]
    );
    await importarLote(pool, [item({ fabricante: "Fabricante LT", nome: "LT Brinco duvida", custo: 60 })], true);
    expect((await pool.query(`SELECT custo_da_pasta FROM products WHERE name = 'LT Brinco duvida'`)).rows[0].custo_da_pasta).toBeNull();
  });

  it("cadastro sem custo é preenchido com o da pasta (e o preço, se faltava)", async () => {
    const fab = (await pool.query(`INSERT INTO manufacturers (name) VALUES ('Fabricante LT') RETURNING id`)).rows[0].id;
    await pool.query(
      `INSERT INTO products (category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active) VALUES ('Brincos', 'LT Sem custo', $1, NULL, NULL, 1, 'varejo', true)`,
      [fab]
    );
    const r = await importarLote(pool, [item({ fabricante: "Fabricante LT", nome: "LT Sem custo", custo: 40 })], true);
    expect(r.itens[0].aviso).toContain("estava vazio");
    const { rows } = await pool.query(`SELECT cost, price, custo_da_pasta FROM products WHERE name = 'LT Sem custo'`);
    expect([Number(rows[0].cost), Number(rows[0].price), rows[0].custo_da_pasta]).toEqual([40, 100, null]);
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

  it("grava o código da peça nova; peça com código provisório (NOVO-) recebe o definitivo; código diferente definitivo só avisa", async () => {
    const fab = (await pool.query(`INSERT INTO manufacturers (name) VALUES ('Fabricante LT') RETURNING id`)).rows[0].id;
    await pool.query(
      `INSERT INTO products (category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active, manufacturer_code) VALUES
         ('Brincos', 'LT Provisória', $1, 50, 125, 1, 'varejo', true, 'NOVO-BR-001'),
         ('Brincos', 'LT Definitiva', $1, 50, 125, 1, 'varejo', true, 'LTFAB-BR-001')`,
      [fab]
    );
    const r = await importarLote(
      pool,
      [
        item({ fabricante: "Fabricante LT", nome: "LT Nova", codigo: "LTFAB-BR-010" }),
        item({ fabricante: "Fabricante LT", nome: "LT Provisória", custo: 50, codigo: "LTFAB-BR-011" }),
        item({ fabricante: "Fabricante LT", nome: "LT Definitiva", custo: 50, codigo: "LTFAB-BR-012" }),
      ],
      true
    );
    const { rows } = await pool.query(`SELECT name, manufacturer_code FROM products WHERE name LIKE 'LT %' ORDER BY name`);
    expect(Object.fromEntries(rows.map((x) => [x.name, x.manufacturer_code]))).toEqual({
      "LT Definitiva": "LTFAB-BR-001",
      "LT Nova": "LTFAB-BR-010",
      "LT Provisória": "LTFAB-BR-011",
    });
    expect(r.itens.find((i) => i.nome === "LT Definitiva")?.aviso).toContain("não mexi");
  });

  it("código já usado por outra peça do mesmo fabricante não é gravado e vira aviso", async () => {
    const fab = (await pool.query(`INSERT INTO manufacturers (name) VALUES ('Fabricante LT') RETURNING id`)).rows[0].id;
    await pool.query(
      `INSERT INTO products (category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active, manufacturer_code) VALUES ('Brincos', 'LT Dona do código', $1, 50, 125, 1, 'varejo', true, 'LTFAB-BR-020')`,
      [fab]
    );
    const r = await importarLote(pool, [item({ fabricante: "Fabricante LT", nome: "LT Quer o mesmo", codigo: "LTFAB-BR-020" })], true);
    expect(r.criadas).toBe(1);
    expect(r.itens[0].aviso).toContain("já é de outra peça");
    expect((await pool.query(`SELECT manufacturer_code FROM products WHERE name = 'LT Quer o mesmo'`)).rows[0].manufacturer_code).toBeNull();
  });

  it("peça nova sem custo é criada sem custo e sem preço (fica com o alerta), e sem foto principal também vale", async () => {
    const r = await importarLote(pool, [{ fabricante: "Fabricante LT", nome: "LT Sem custo ainda", custo: null, categoria: "Brincos", fotoPrincipal: null }], true);
    expect(r.criadas).toBe(1);
    const { rows } = await pool.query(`SELECT cost, price, photo_url, stock_qty, catalog_photo FROM products WHERE name = 'LT Sem custo ainda'`);
    expect(rows[0]).toMatchObject({ cost: null, price: null, photo_url: null, stock_qty: 1 });
    expect(rows[0].catalog_photo).toEqual({ kind: "limpa", fx: 50, fy: 50, zoom: 1 });
    await pool.query(`DELETE FROM manufacturers WHERE name = 'Fabricante LT'`);
  });

  it("atualizar sem mandar fotos não mexe nas fotos; mandar só a da modelo troca só ela; guarda de que arquivo veio cada uma", async () => {
    await importarLote(pool, [item({ fotoOrigem: "close.png|100|1", modeloOrigem: "modelo.png|200|2" })], true);
    // só o custo/código: nenhuma foto no item
    await importarLote(pool, [{ fabricante: "Brilhare", nome: "Brinco flor em pérola", custo: 77, categoria: "Brincos", codigo: "BRILHARE-BR-001" }], true);
    let linha = (await pool.query(`SELECT photo_url, foto_origem, modelo_origem, manufacturer_code FROM products WHERE name = 'Brinco flor em pérola'`)).rows[0];
    expect(linha).toMatchObject({ photo_url: "/estoque/brilhare/brinco-close.jpg", foto_origem: "close.png|100|1", modelo_origem: "modelo.png|200|2", manufacturer_code: "BRILHARE-BR-001" });
    // só a foto da modelo nova
    await importarLote(pool, [{ fabricante: "Brilhare", nome: "Brinco flor em pérola", custo: 77, categoria: "Brincos", fotoModelo: "https://blob.example/modelo2.jpg", modeloOrigem: "modelo2.png|300|3" }], true);
    linha = (await pool.query(`SELECT photo_url, foto_origem, modelo_origem FROM products WHERE name = 'Brinco flor em pérola'`)).rows[0];
    expect(linha).toMatchObject({ photo_url: "/estoque/brilhare/brinco-close.jpg", foto_origem: "close.png|100|1", modelo_origem: "modelo2.png|300|3" });
    const modelo = await pool.query(`SELECT url FROM product_photos pp JOIN products p ON p.id = pp.product_id WHERE p.name = 'Brinco flor em pérola' AND pp.kind = 'modelo'`);
    expect(modelo.rows).toEqual([{ url: "https://blob.example/modelo2.jpg" }]);
    // fotoModelo nulo remove a foto e a origem
    await importarLote(pool, [{ fabricante: "Brilhare", nome: "Brinco flor em pérola", custo: 77, categoria: "Brincos", fotoModelo: null }], true);
    linha = (await pool.query(`SELECT modelo_origem FROM products WHERE name = 'Brinco flor em pérola'`)).rows[0];
    expect(linha.modelo_origem).toBeNull();
  });

  it("se algo falha no meio, nada é gravado", async () => {
    const ruim = item({ nome: "LT Segunda", categoria: "Brincos", catalogo: { kind: "limpa", fx: 50, fy: 50, zoom: 1 } });
    // custo gigante estoura a coluna NUMERIC(12,2) no segundo item
    await expect(importarLote(pool, [item({ nome: "LT Primeira" }), { ...ruim, custo: 1e15 }], true)).rejects.toThrow();
    expect((await pool.query(`SELECT count(*)::int AS n FROM products WHERE name LIKE 'LT %'`)).rows[0].n).toBe(0);
  });
});
