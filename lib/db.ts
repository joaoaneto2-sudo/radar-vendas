import { Pool, types } from "pg";
import { runMigrations } from "./migrations";

// Datas (tipo DATE) saem do banco como texto AAAA-MM-DD, sem fuso horário.
// Assim o dia nunca "anda" (por exemplo, 01/09 virando 31/08 num servidor de outro fuso).
types.setTypeParser(1082, (valor: string) => valor);

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

// Garante que o banco está na versão mais nova. As mudanças do banco ficam em
// lib/migrations.ts, com histórico: cada uma roda uma única vez.
export function ensureSchema(): Promise<void> {
  const db = getPool();
  if (!db) return Promise.reject(new Error("db_not_configured"));

  if (!schemaReady) {
    schemaReady = runMigrations(db)
      .then(() => undefined)
      .catch((erro) => {
        // Se falhar, tenta de novo na próxima chamada em vez de travar de vez.
        schemaReady = null;
        throw erro;
      });
  }
  return schemaReady;
}
