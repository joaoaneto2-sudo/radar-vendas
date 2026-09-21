import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEGACY_BASELINE_STATEMENTS, runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

// Loja online: colunas novas, regras do banco, ajustes em chave e valor, visões e o usuário somente leitura.

const disponivel = await bancoDeTesteDisponivel();

// Colunas de products que o usuário da loja pode ler (pedido do João). Nada de custo, compra,
// fornecedor ou fabricante. Se o script liberar uma coluna a mais, o teste falha.
const COLUNAS_LIBERADAS = {
  products: [
    "id", "name", "category", "subtype", "jewelry_type", "material", "karat", "gemstone",
    "warranty", "public_description", "price", "sale_price", "stock_qty", "featured",
    "photo_url", "created_at", "sale_channel", "active", "show_online",
  ],
  product_photos: ["id", "product_id", "url", "position"],
  store_settings: ["key", "value"],
  site_slots: ["area", "category", "position", "product_id", "photo_url"],
};

// Colunas das visões (que continuam no banco, sem uso pela loja).
const COLUNAS_DA_VISAO = [
  "id", "category", "subtype", "jewelry_type", "name", "material", "karat", "gemstone",
  "age_group", "gender", "price", "sale_price", "stock_qty", "warranty", "photo_url",
  "featured", "public_description",
];

// Consultas da loja (copiadas de loja-fernanda-brilhante/lib/dados/postgres.ts). Se a loja
// mudar as dela, copie de novo aqui: este teste prova que o usuário de leitura consegue rodá-las.
const COLUNAS_DA_LOJA = `
  p.id, p.name, p.category, p.subtype, p.jewelry_type, p.material, p.karat, p.gemstone,
  p.warranty, p.public_description, p.price::text AS price, p.sale_price::text AS sale_price,
  p.stock_qty, p.featured, p.photo_url, p.created_at,
  COALESCE(
    (SELECT json_agg(f.url ORDER BY f.position, f.id) FROM product_photos f WHERE f.product_id = p.id),
    '[]'::json
  ) AS extras`;
const VISIVEL_NA_LOJA = `p.sale_channel = 'varejo' AND p.active = true AND p.show_online = true AND p.price > 0`;
const SQL_PECAS = `SELECT ${COLUNAS_DA_LOJA} FROM products p WHERE ${VISIVEL_NA_LOJA} ORDER BY p.created_at DESC, p.id DESC`;
const SQL_PECA = `SELECT ${COLUNAS_DA_LOJA} FROM products p WHERE ${VISIVEL_NA_LOJA} AND p.id = $1`;
const SQL_CONFIG = `SELECT key, value::text AS value FROM store_settings`;
const SQL_VITRINE_CARROSSEL = `SELECT s.product_id, s.photo_url, s.position FROM site_slots s JOIN products p ON p.id = s.product_id WHERE s.area = 'carrossel' AND ${VISIVEL_NA_LOJA} ORDER BY s.position, s.product_id`;
const SQL_VITRINE_CATEGORIAS = `SELECT s.category, s.photo_url FROM site_slots s JOIN products p ON p.id = s.product_id WHERE s.area = 'categoria' AND ${VISIVEL_NA_LOJA}`;

describe.skipIf(!disponivel)("loja online no banco", () => {
  let pool: Pool;
  let apagar: () => Promise<void>;
  let url: string;

  beforeAll(async () => {
    const banco = await criarBancoDescartavel();
    pool = banco.pool;
    apagar = banco.apagar;
    url = banco.url;
    await runMigrations(pool);
  });

  afterAll(async () => {
    await apagar?.();
  });

  it("peças que já existiam continuam iguais e ficam fora do site, sem promoção", async () => {
    // Reproduz o banco real: peças criadas antes da loja existir.
    const banco = await criarBancoDescartavel();
    try {
      for (const comando of LEGACY_BASELINE_STATEMENTS) await banco.pool.query(comando);
      await banco.pool.query(
        `INSERT INTO products (name, price, cost, stock_qty) VALUES ('Anel antigo', 180.00, 60.00, 4)`
      );
      await runMigrations(banco.pool);
      const { rows } = await banco.pool.query(
        `SELECT name, price, cost, stock_qty, show_online, featured, sale_price, public_description FROM products`
      );
      expect(rows).toEqual([
        {
          name: "Anel antigo", price: "180.00", cost: "60.00", stock_qty: 4,
          show_online: false, featured: false, sale_price: null, public_description: null,
        },
      ]);
    } finally {
      await banco.apagar();
    }
  });

  it("regras da loja garantidas pelo banco", async () => {
    await pool.query(`DELETE FROM products`);
    // Carrossel só com o site ligado.
    await expect(pool.query(`INSERT INTO products (name, price, featured) VALUES ('a', 100, true)`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO products (name, price, show_online, featured) VALUES ('b', 100, true, true)`)).resolves.toBeDefined();
    // Peça de atacado não vai para o site.
    await expect(
      pool.query(`INSERT INTO products (name, price, show_online, sale_channel) VALUES ('c', 100, true, 'atacado')`)
    ).rejects.toThrow();
    // Promoção precisa ser menor que o preço normal, e nunca zero.
    await expect(pool.query(`INSERT INTO products (name, price, sale_price) VALUES ('d', 100, 100)`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO products (name, price, sale_price) VALUES ('e', 100, 120)`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO products (name, price, sale_price) VALUES ('f', 100, 0)`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO products (name, sale_price) VALUES ('g', 50)`)).rejects.toThrow(); // sem preço normal
    await expect(pool.query(`INSERT INTO products (name, price, sale_price) VALUES ('h', 100, 79.90)`)).resolves.toBeDefined();
    await expect(pool.query(`INSERT INTO products (name, price, sale_price) VALUES ('i', 100, NULL)`)).resolves.toBeDefined();
  });

  it("fotos extras: ordem e remoção junto com a peça", async () => {
    await pool.query(`DELETE FROM products`);
    const { rows } = await pool.query(`INSERT INTO products (name, price) VALUES ('Com fotos', 100) RETURNING id`);
    const id = rows[0].id;
    await pool.query(
      `INSERT INTO product_photos (product_id, url, position) VALUES ($1, 'https://x/2.jpg', 1), ($1, 'https://x/1.jpg', 0)`,
      [id]
    );
    const { rows: fotos } = await pool.query(`SELECT url FROM product_photos WHERE product_id = $1 ORDER BY position`, [id]);
    expect(fotos.map((f) => f.url)).toEqual(["https://x/1.jpg", "https://x/2.jpg"]);
    await pool.query(`DELETE FROM products WHERE id = $1`, [id]);
    expect((await pool.query(`SELECT count(*)::int AS n FROM product_photos`)).rows[0].n).toBe(0);
  });

  describe("ajustes da loja em chave e valor (migração 011)", () => {
    it("num banco novo: tabela chave e valor, com os padrões (entrega e Correios ficam de fora)", async () => {
      const { rows: colunas } = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'store_settings' ORDER BY column_name`
      );
      expect(colunas.map((c) => c.column_name)).toEqual(["key", "value"]);
      const { rows } = await pool.query(`SELECT key, value FROM store_settings ORDER BY key`);
      expect(rows).toEqual([
        { key: "acrescimo_parcela", value: "10.00" },
        { key: "max_parcelas", value: "12" },
      ]);
      // A chave é única.
      await expect(pool.query(`INSERT INTO store_settings (key, value) VALUES ('max_parcelas', '6')`)).rejects.toThrow();
    });

    it("num banco que já estava na 010, com valores salvos: nada se perde", async () => {
      const banco = await criarBancoDescartavel();
      try {
        await runMigrations(banco.pool, { ate: "010" });
        await banco.pool.query(
          `UPDATE store_settings SET delivery_salvador = 15, shipping_correios = 25.5, installment_fee = 12.5, max_installments = 10`
        );
        expect(await runMigrations(banco.pool)).toEqual(["011", "012", "013", "014", "015"]);

        const { rows } = await banco.pool.query(`SELECT key, value FROM store_settings ORDER BY key`);
        expect(rows).toEqual([
          { key: "acrescimo_parcela", value: "12.50" },
          { key: "correios", value: "25.50" },
          { key: "entrega_salvador", value: "15.00" },
          { key: "max_parcelas", value: "10" },
        ]);
        // A tabela antiga fica guardada com os valores.
        const { rows: antiga } = await banco.pool.query(`SELECT delivery_salvador, max_installments FROM store_settings_v1`);
        expect(antiga).toEqual([{ delivery_salvador: "15.00", max_installments: 10 }]);
        // Rodar de novo não faz nada.
        expect(await runMigrations(banco.pool)).toEqual([]);
      } finally {
        await banco.apagar();
      }
    });
  });

  it("visão da loja: só peças no site, ativas e não de atacado, e só as colunas públicas", async () => {
    await pool.query(`DELETE FROM products`);
    await pool.query(
      `INSERT INTO products (name, price, cost, sale_price, show_online, featured, active, stock_qty, purchase_qty, photo_url) VALUES
         ('No site', 100, 40, 80, true, true, true, 3, 10, 'https://x/p.jpg'),
         ('Fora do site', 100, 40, NULL, false, false, true, 3, 10, NULL),
         ('No site mas inativa', 100, 40, NULL, true, false, false, 3, 10, NULL)`
    );
    await pool.query(
      `INSERT INTO products (name, price, sale_channel) VALUES ('Da Bia (atacado)', 100, 'atacado')`
    );
    const { rows } = await pool.query(`SELECT * FROM store_products`);
    expect(rows.map((r) => r.name)).toEqual(["No site"]);
    expect(Object.keys(rows[0]).sort()).toEqual([...COLUNAS_DA_VISAO].sort());
    expect(rows[0]).toMatchObject({ price: "100.00", sale_price: "80.00", featured: true, stock_qty: 3 });

    const { rows: cols } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'store_product_photos'`
    );
    expect(cols.map((c) => c.column_name).sort()).toEqual(["id", "position", "product_id", "url"]);
  });

  it("visão de fotos: só as fotos de peças que estão no site", async () => {
    await pool.query(`DELETE FROM products`);
    const { rows } = await pool.query(
      `INSERT INTO products (name, price, show_online) VALUES ('No site', 100, true), ('Fora', 100, false) RETURNING id, name`
    );
    for (const p of rows) {
      await pool.query(`INSERT INTO product_photos (product_id, url, position) VALUES ($1, $2, 0)`, [p.id, `https://x/${p.name}.jpg`]);
    }
    const { rows: fotos } = await pool.query(`SELECT url FROM store_product_photos`);
    expect(fotos).toEqual([{ url: "https://x/No site.jpg" }]);
  });

  describe("usuário somente leitura (scripts/loja-usuario-leitura.sql)", () => {
    const papel = `loja_leitura_teste_${Math.random().toString(36).slice(2, 8)}`;
    const senha = `senha-de-teste-${Math.random().toString(36).slice(2, 10)}`;
    let loja: Pool;
    let admin: Pool;

    beforeAll(async () => {
      // Roda o script de verdade, só trocando o nome do usuário (papéis valem para o servidor todo,
      // e assim este teste nunca esbarra num usuário real) e a senha de teste.
      const original = readFileSync(join(__dirname, "../../scripts/loja-usuario-leitura.sql"), "utf8").replaceAll(
        "loja_leitura",
        papel
      );
      // Sem trocar a senha de exemplo, o script se recusa a criar o usuário.
      await expect(pool.query(original)).rejects.toThrow(/Troque a senha/);
      await expect(pool.query(original.replace("senha text := 'TROQUE_ESTA_SENHA'", "senha text := 'curta'"))).rejects.toThrow(/Troque a senha/);
      expect((await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [papel])).rowCount).toBe(0);

      const script = original.replace("senha text := 'TROQUE_ESTA_SENHA'", `senha text := '${senha}'`);
      await pool.query(script);
      await pool.query(script); // pode rodar de novo sem estragar

      // Dados de teste: uma peça à venda na loja, uma escondida, uma de atacado, e dados privados.
      await pool.query(`DELETE FROM products`);
      const { rows } = await pool.query(
        `INSERT INTO products (name, price, sale_price, cost, purchase_qty, show_online, featured, stock_qty, photo_url) VALUES
           ('Peça pública', 100, 80, 40, 10, true, true, 3, 'https://x/p.jpg'),
           ('Peça escondida', 100, NULL, 40, 10, false, false, 1, NULL)
         RETURNING id`
      );
      await pool.query(`INSERT INTO products (name, price, sale_channel) VALUES ('Peça da Bia', 100, 'atacado')`);
      await pool.query(`INSERT INTO product_photos (product_id, url, position) VALUES ($1, 'https://x/2.jpg', 2), ($1, 'https://x/1.jpg', 1)`, [rows[0].id]);
      await pool.query(`INSERT INTO store_settings (key, value) VALUES ('entrega_salvador', '15.00'), ('correios', '25.00') ON CONFLICT (key) DO NOTHING`);
      await pool.query(`INSERT INTO sales (sale_date, sale_value, client_name) VALUES ('2026-09-01', 100, 'Cliente secreto')`);
      await pool.query(`INSERT INTO clients (full_name) VALUES ('Cliente secreto')`);

      const u = new URL(url);
      u.username = papel;
      u.password = senha;
      loja = new Pool({ connectionString: u.toString() });
      admin = pool;
    });

    afterAll(async () => {
      await loja?.end();
      await admin.query(`DROP OWNED BY ${papel}`);
      await admin.query(`DROP ROLE IF EXISTS ${papel}`);
    });

    it("roda as consultas da própria loja (peças, peça e ajustes)", async () => {
      const pecas = await loja.query(SQL_PECAS);
      expect(pecas.rows.map((r) => r.name)).toEqual(["Peça pública"]); // a loja filtra: escondida e de atacado ficam fora
      expect(pecas.rows[0]).toMatchObject({ price: "100.00", sale_price: "80.00", featured: true, stock_qty: 3 });
      expect(pecas.rows[0].extras).toEqual(["https://x/1.jpg", "https://x/2.jpg"]); // na ordem de position

      const uma = await loja.query(SQL_PECA, [pecas.rows[0].id]);
      expect(uma.rows).toHaveLength(1);

      const config = await loja.query(SQL_CONFIG);
      const mapa = Object.fromEntries(config.rows.map((r) => [r.key, r.value]));
      expect(mapa).toMatchObject({ entrega_salvador: "15.00", correios: "25.00", acrescimo_parcela: "10.00", max_parcelas: "12" });
    });

    it("roda as consultas da vitrine (só vagas de peças publicadas) e não lê o resto de site_slots", async () => {
      const { rows: pub } = await admin.query(`SELECT id FROM products WHERE name = 'Peça pública'`);
      const { rows: esc } = await admin.query(`SELECT id FROM products WHERE name = 'Peça escondida'`);
      await admin.query(`DELETE FROM site_slots`);
      await admin.query(
        `INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 0, $1, 'https://x/car.jpg'), ('carrossel', 1, $2, 'https://x/esc.jpg')`,
        [pub[0].id, esc[0].id]
      );
      await admin.query(
        `INSERT INTO site_slots (area, category, position, product_id, photo_url) VALUES ('categoria', 'Anéis', 0, $1, 'https://x/cat.jpg'), ('categoria', 'Brincos', 0, $2, 'https://x/esc2.jpg')`,
        [pub[0].id, esc[0].id]
      );

      const carrossel = await loja.query(SQL_VITRINE_CARROSSEL);
      expect(carrossel.rows.map((r) => [r.product_id, r.photo_url])).toEqual([[pub[0].id, "https://x/car.jpg"]]); // a escondida fica de fora
      const categorias = await loja.query(SQL_VITRINE_CATEGORIAS);
      expect(categorias.rows).toEqual([{ category: "Anéis", photo_url: "https://x/cat.jpg" }]);

      await expect(loja.query(`SELECT id FROM site_slots`)).rejects.toThrow(/permission denied/);
      await expect(loja.query(`SELECT created_at FROM site_slots`)).rejects.toThrow(/permission denied/);
      await expect(loja.query(`SELECT * FROM site_slots`)).rejects.toThrow(/permission denied/);
      await expect(
        loja.query(`INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 9, ${pub[0].id}, 'x')`)
      ).rejects.toThrow();
      await admin.query(`DELETE FROM site_slots`);
    });

    it("não consegue ler custo, compra, fornecedor, fabricante, vendas, clientes nem o financeiro", async () => {
      for (const coluna of ["cost", "purchase_date", "purchase_qty", "purchase_payment_method", "supplier_id", "manufacturer_id", "age_group"]) {
        await expect(loja.query(`SELECT ${coluna} FROM products`), coluna).rejects.toThrow(/permission denied/);
      }
      await expect(loja.query(`SELECT * FROM products`)).rejects.toThrow(/permission denied/);
      await expect(loja.query(`SELECT * FROM sales`)).rejects.toThrow(/permission denied/);
      await expect(loja.query(`SELECT * FROM clients`)).rejects.toThrow(/permission denied/);
      await expect(loja.query(`SELECT created_at FROM product_photos`)).rejects.toThrow(/permission denied/);
      for (const tabela of [
        "receipts", "expenses", "card_invoices", "card_invoice_parts", "stock_purchases", "fund_payments", "liabilities",
        "users", "agreement_settings", "manufacturers", "suppliers", "sellers", "sale_payments", "store_settings_v1",
        "store_products", "store_product_photos", "schema_migrations",
      ]) {
        await expect(loja.query(`SELECT * FROM ${tabela}`), tabela).rejects.toThrow(/permission denied/);
      }
    });

    it("não consegue escrever em nada, nem criar tabela", async () => {
      await expect(loja.query(`UPDATE store_settings SET value = '0' WHERE key = 'correios'`)).rejects.toThrow();
      await expect(loja.query(`INSERT INTO store_settings (key, value) VALUES ('x', 'y')`)).rejects.toThrow();
      await expect(loja.query(`DELETE FROM store_settings`)).rejects.toThrow();
      await expect(loja.query(`UPDATE products SET price = 1`)).rejects.toThrow();
      await expect(loja.query(`INSERT INTO product_photos (product_id, url) VALUES (1, 'x')`)).rejects.toThrow();
      await expect(loja.query(`CREATE TABLE lixo (id int)`)).rejects.toThrow();
      // Mesmo pedindo para sair do modo somente leitura, continua sem permissão.
      await loja.query(`SET default_transaction_read_only = off`);
      await expect(loja.query(`UPDATE store_settings SET value = '0' WHERE key = 'correios'`)).rejects.toThrow(/permission denied/);
    });

    it("sem poderes especiais, e só as colunas combinadas em só três tabelas", async () => {
      const { rows: papeis } = await admin.query(
        `SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication FROM pg_roles WHERE rolname = $1`,
        [papel]
      );
      expect(papeis[0]).toEqual({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false, rolreplication: false });

      const { rows: tabelas } = await admin.query(
        `SELECT c.relname FROM pg_class c
          WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v', 'm')
            AND has_any_column_privilege($1, c.oid, 'SELECT')
          ORDER BY c.relname`,
        [papel]
      );
      expect(tabelas.map((r) => r.relname)).toEqual(["product_photos", "products", "site_slots", "store_settings"]);

      // Coluna por coluna, nas três tabelas.
      for (const [tabela, esperadas] of Object.entries(COLUNAS_LIBERADAS)) {
        const { rows } = await admin.query(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $2 AND has_column_privilege($1, table_name, column_name, 'SELECT')`,
          [papel, tabela]
        );
        expect(rows.map((r) => r.column_name).sort(), tabela).toEqual([...esperadas].sort());
      }
      const { rows: escreve } = await admin.query(
        `SELECT bool_or(has_table_privilege($1, c.oid, 'INSERT') OR has_table_privilege($1, c.oid, 'UPDATE') OR has_table_privilege($1, c.oid, 'DELETE')) AS pode
           FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'`,
        [papel]
      );
      expect(escreve[0].pode).toBe(false);
    });
  });
});
