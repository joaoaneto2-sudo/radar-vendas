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

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  const db = getPool();
  if (!db) return Promise.reject(new Error("db_not_configured"));

  if (!schemaReady) {
    schemaReady = db
      .query(
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
        )`
      )
      .then(() => undefined);
  }
  return schemaReady;
}
