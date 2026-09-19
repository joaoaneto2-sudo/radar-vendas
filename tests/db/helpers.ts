import { Pool } from "pg";

// Testes com banco de verdade. Regras de segurança:
// 1. Só rodam em banco LOCAL (localhost). Se o endereço for outro, o teste para com erro.
// 2. Cada teste cria um banco descartável com nome único e apaga no fim.
//    O banco real (Neon) nunca é tocado.

const ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres:teste@localhost:5433/postgres?sslmode=disable";

function garantirBancoLocal(url: string) {
  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(
      `Recusado: os testes de banco só rodam em banco local. Endereço informado: ${host}`
    );
  }
}

garantirBancoLocal(ADMIN_URL);

export async function bancoDeTesteDisponivel(): Promise<boolean> {
  const pool = new Pool({ connectionString: ADMIN_URL, connectionTimeoutMillis: 3000 });
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function criarBancoDescartavel() {
  const nome = `radar_teste_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new Pool({ connectionString: ADMIN_URL });
  await admin.query(`CREATE DATABASE ${nome}`);

  const url = new URL(ADMIN_URL);
  url.pathname = `/${nome}`;
  const pool = new Pool({ connectionString: url.toString() });

  return {
    pool,
    url: url.toString(),
    async apagar() {
      await pool.end();
      await admin.query(`DROP DATABASE ${nome} WITH (FORCE)`);
      await admin.end();
    },
  };
}
