import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEGACY_BASELINE_STATEMENTS, runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

// Loja online: colunas novas, regras do banco, visões públicas e o usuário somente leitura.

const disponivel = await bancoDeTesteDisponivel();

// Colunas que a loja pode ver de cada peça. Se alguém acrescentar uma coluna aqui sem querer,
// este teste falha: custo, compra, fornecedor e fabricante nunca podem aparecer.
const COLUNAS_PUBLICAS_DA_PECA = [
  "id", "category", "subtype", "jewelry_type", "name", "material", "karat", "gemstone",
  "age_group", "gender", "price", "sale_price", "stock_qty", "warranty", "photo_url",
  "featured", "public_description",
];

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

  it("ajustes da loja: uma linha só, com os padrões combinados", async () => {
    const { rows } = await pool.query(`SELECT * FROM store_settings`);
    expect(rows).toHaveLength(1);
    expect(rows[0].delivery_salvador).toBeNull(); // ainda não definido, não zero
    expect(rows[0].shipping_correios).toBeNull();
    expect(Number(rows[0].installment_fee)).toBe(10);
    expect(rows[0].max_installments).toBe(12);
    await expect(pool.query(`INSERT INTO store_settings (id) VALUES (2)`)).rejects.toThrow();
    await expect(pool.query(`UPDATE store_settings SET max_installments = 25`)).rejects.toThrow();
    await expect(pool.query(`UPDATE store_settings SET delivery_salvador = -1`)).rejects.toThrow();
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
    expect(Object.keys(rows[0]).sort()).toEqual([...COLUNAS_PUBLICAS_DA_PECA].sort());
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
      // Sem trocar a senha de exemplo, o script se recusa a criar o usuario.
      await expect(pool.query(original)).rejects.toThrow(/Troque a senha/);
      await expect(pool.query(original.replace("senha text := 'TROQUE_ESTA_SENHA'", "senha text := 'curta'"))).rejects.toThrow(/Troque a senha/);
      expect((await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [papel])).rowCount).toBe(0);

      const script = original.replace("senha text := 'TROQUE_ESTA_SENHA'", `senha text := '${senha}'`);
      await pool.query(script);
      await pool.query(script); // pode rodar de novo sem estragar

      await pool.query(`DELETE FROM products`);
      await pool.query(
        `INSERT INTO products (name, price, cost, show_online) VALUES ('Peça pública', 100, 40, true), ('Peça escondida', 100, 40, false)`
      );
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

    it("lê as peças do site, as fotos e os ajustes da loja", async () => {
      const pecas = await loja.query(`SELECT name FROM store_products`);
      expect(pecas.rows).toEqual([{ name: "Peça pública" }]);
      await expect(loja.query(`SELECT * FROM store_product_photos`)).resolves.toBeDefined();
      const ajustes = await loja.query(`SELECT installment_fee, max_installments FROM store_settings`);
      expect(ajustes.rows).toHaveLength(1);
    });

    it("não consegue ler custo, compra, vendas, clientes nem o financeiro", async () => {
      await expect(loja.query(`SELECT cost FROM products`)).rejects.toThrow(/permission denied/);
      await expect(loja.query(`SELECT * FROM products`)).rejects.toThrow(/permission denied/);
      await expect(loja.query(`SELECT purchase_qty FROM products`)).rejects.toThrow(/permission denied/);
      await expect(loja.query(`SELECT * FROM sales`)).rejects.toThrow(/permission denied/);
      await expect(loja.query(`SELECT * FROM clients`)).rejects.toThrow(/permission denied/);
      for (const tabela of ["receipts", "expenses", "card_invoices", "stock_purchases", "liabilities", "users", "agreement_settings", "manufacturers", "suppliers", "product_photos"]) {
        await expect(loja.query(`SELECT * FROM ${tabela}`)).rejects.toThrow(/permission denied/);
      }
    });

    it("não consegue escrever em nada, nem criar tabela", async () => {
      await expect(loja.query(`UPDATE store_settings SET installment_fee = 0`)).rejects.toThrow();
      await expect(loja.query(`INSERT INTO store_settings (id) VALUES (3)`)).rejects.toThrow();
      await expect(loja.query(`DELETE FROM store_products`)).rejects.toThrow();
      await expect(loja.query(`UPDATE products SET price = 1`)).rejects.toThrow();
      await expect(loja.query(`CREATE TABLE lixo (id int)`)).rejects.toThrow();
      // Mesmo pedindo para sair do modo somente leitura, continua sem permissão.
      await loja.query(`SET default_transaction_read_only = off`);
      await expect(loja.query(`UPDATE store_settings SET installment_fee = 0`)).rejects.toThrow(/permission denied/);
    });

    it("sem poderes especiais, e só as três leituras combinadas", async () => {
      const { rows: papeis } = await admin.query(
        `SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication FROM pg_roles WHERE rolname = $1`,
        [papel]
      );
      expect(papeis[0]).toEqual({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false, rolreplication: false });

      const { rows } = await admin.query(
        `SELECT c.relname FROM pg_class c
          WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v', 'm')
            AND has_table_privilege($1, c.oid, 'SELECT')
          ORDER BY c.relname`,
        [papel]
      );
      expect(rows.map((r) => r.relname)).toEqual(["store_product_photos", "store_products", "store_settings"]);
      const { rows: cols } = await admin.query(
        `SELECT has_column_privilege($1, 'products', 'cost', 'SELECT') AS custo, has_column_privilege($1, 'sales', 'sale_value', 'SELECT') AS vendas`,
        [papel]
      );
      expect(cols[0]).toEqual({ custo: false, vendas: false });
    });
  });
});
