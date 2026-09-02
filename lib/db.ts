import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool | null {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

  if (!connectionString) return null;

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    sale_date DATE NOT NULL,
    sale_type TEXT NOT NULL,
    seller TEXT NOT NULL,
    product_type TEXT NOT NULL,
    manufacturer TEXT,
    supplier TEXT,
    warranty TEXT,
    cost NUMERIC(12,2) NOT NULL,
    sale_value NUMERIC(12,2) NOT NULL,
    payment_method TEXT NOT NULL,
    installments_count INT,
    installments_dates TEXT,
    client_name TEXT NOT NULL,
    client_nickname TEXT,
    client_city TEXT,
    client_phone TEXT,
    client_birthday DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS manufacturers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sellers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    nickname TEXT,
    city TEXT,
    phone TEXT,
    birthday DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    subtype TEXT NOT NULL,
    jewelry_type TEXT NOT NULL,
    name TEXT NOT NULL,
    manufacturer_id INT REFERENCES manufacturers(id) ON DELETE SET NULL,
    supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
    cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    stock_qty INT NOT NULL DEFAULT 0,
    warranty TEXT,
    photo_url TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE sales ADD COLUMN IF NOT EXISTS product_id INT REFERENCES products(id) ON DELETE SET NULL`,
  `ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_id INT REFERENCES clients(id) ON DELETE SET NULL`,
  `ALTER TABLE sales ADD COLUMN IF NOT EXISTS seller_id INT REFERENCES sellers(id) ON DELETE SET NULL`,
  // Nothing should block saving a sale — every business field is fillable later.
  `ALTER TABLE sales ALTER COLUMN sale_type DROP NOT NULL`,
  `ALTER TABLE sales ALTER COLUMN seller DROP NOT NULL`,
  `ALTER TABLE sales ALTER COLUMN product_type DROP NOT NULL`,
  `ALTER TABLE sales ALTER COLUMN cost DROP NOT NULL`,
  `ALTER TABLE sales ALTER COLUMN sale_value DROP NOT NULL`,
  `ALTER TABLE sales ALTER COLUMN payment_method DROP NOT NULL`,
  `ALTER TABLE sales ALTER COLUMN client_name DROP NOT NULL`,
  // Same for products — a product can be saved with just a photo and a price, or less.
  `ALTER TABLE products ALTER COLUMN category DROP NOT NULL`,
  `ALTER TABLE products ALTER COLUMN subtype DROP NOT NULL`,
  `ALTER TABLE products ALTER COLUMN jewelry_type DROP NOT NULL`,
  `ALTER TABLE products ALTER COLUMN name DROP NOT NULL`,
  `ALTER TABLE products ALTER COLUMN cost DROP NOT NULL`,
  `ALTER TABLE products ALTER COLUMN cost DROP DEFAULT`,
  `ALTER TABLE products ALTER COLUMN price DROP NOT NULL`,
  `ALTER TABLE products ALTER COLUMN price DROP DEFAULT`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS material TEXT`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS gemstone TEXT`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS age_group TEXT`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS gender TEXT`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS karat TEXT`,
  `ALTER TABLE clients ALTER COLUMN full_name DROP NOT NULL`,
];

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  const db = getPool();
  if (!db) return Promise.reject(new Error("db_not_configured"));

  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await db.query(statement);
      }
    })();
  }
  return schemaReady;
}
