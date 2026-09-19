import { createHash, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { dummyHash, hashPassword, validatePassword, verifyPassword } from "./password";

// Regras de quem pode entrar. Fala com o banco, mas não conhece o Next.

export interface AuthUser {
  id: number;
  name: string;
  email: string;
}

export const MAX_USERS = 2; // João e Fernanda
const JANELA = "15 minutes";
const MAX_FALHAS_POR_EMAIL = 5;
const MAX_FALHAS_POR_IP = 20;
const MAX_FALHAS_CADASTRO_POR_IP = 10;
const TRAVA_CADASTRO = 727275; // "reserva a vez" para dois cadastros não passarem juntos do limite

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function falhasRecentes(
  pool: Pool,
  tipo: "login" | "register",
  coluna: "identifier" | "ip",
  valor: string
): Promise<number> {
  // "coluna" vem sempre de uma lista fixa aqui no código, nunca do que a pessoa digita.
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM login_attempts
      WHERE kind = $1 AND ${coluna} = $2 AND success = false
        AND created_at > now() - interval '${JANELA}'`,
    [tipo, valor]
  );
  return rows[0].n;
}

async function registrarTentativa(
  pool: Pool,
  tipo: "login" | "register",
  identificador: string,
  ip: string,
  sucesso: boolean
): Promise<void> {
  await pool.query(
    `INSERT INTO login_attempts (kind, identifier, ip, success) VALUES ($1, $2, $3, $4)`,
    [tipo, identificador, ip, sucesso]
  );
  // Limpeza: tentativas com mais de um dia não servem mais para nada.
  await pool.query(`DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'`);
}

export type LoginResult =
  | { ok: true; user: AuthUser }
  | { ok: false; code: "invalid" | "locked" };

export async function loginUser(
  pool: Pool,
  entrada: { email: string; password: string; ip: string }
): Promise<LoginResult> {
  const email = normalizeEmail(entrada.email ?? "");
  const ip = entrada.ip || "desconhecido";
  if (!email || !entrada.password) return { ok: false, code: "invalid" };

  const bloqueado =
    (await falhasRecentes(pool, "login", "identifier", email)) >= MAX_FALHAS_POR_EMAIL ||
    (await falhasRecentes(pool, "login", "ip", ip)) >= MAX_FALHAS_POR_IP;
  if (bloqueado) return { ok: false, code: "locked" };

  const { rows } = await pool.query(
    `SELECT id, name, email, password_hash FROM users WHERE lower(email) = $1`,
    [email]
  );
  const usuario = rows[0];

  // Mesma conta cara com ou sem usuário, para o tempo de resposta não entregar quais e-mails existem.
  const senhaConfere = await verifyPassword(entrada.password, usuario?.password_hash ?? (await dummyHash()));
  const ok = Boolean(usuario) && senhaConfere;

  await registrarTentativa(pool, "login", email, ip, ok);
  if (!ok) return { ok: false, code: "invalid" };

  await pool.query(`DELETE FROM login_attempts WHERE kind = 'login' AND identifier = $1 AND success = false`, [email]);
  await pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [usuario.id]);
  return { ok: true, user: { id: usuario.id, name: usuario.name, email: usuario.email } };
}

export type RegisterErrorCode =
  | "not_configured"
  | "locked"
  | "invalid_invite"
  | "closed"
  | "invalid_name"
  | "invalid_email"
  | "weak_password"
  | "email_in_use";

export type RegisterResult =
  | { ok: true; user: AuthUser }
  | { ok: false; code: RegisterErrorCode; message?: string };

function codigosIguais(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function registerUser(
  pool: Pool,
  entrada: { name: string; email: string; password: string; inviteCode: string; ip: string },
  esperado: { inviteCode: string | undefined }
): Promise<RegisterResult> {
  if (!esperado.inviteCode || esperado.inviteCode.length < 8) return { ok: false, code: "not_configured" };

  const ip = entrada.ip || "desconhecido";
  if ((await falhasRecentes(pool, "register", "ip", ip)) >= MAX_FALHAS_CADASTRO_POR_IP) {
    return { ok: false, code: "locked" };
  }

  if (!codigosIguais(entrada.inviteCode ?? "", esperado.inviteCode)) {
    await registrarTentativa(pool, "register", ip, ip, false);
    return { ok: false, code: "invalid_invite" };
  }

  const nome = (entrada.name ?? "").trim();
  if (nome.length < 1 || nome.length > 80) return { ok: false, code: "invalid_name" };

  const email = normalizeEmail(entrada.email ?? "");
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: "invalid_email" };
  }

  const problemaDaSenha = validatePassword(entrada.password ?? "", email);
  if (problemaDaSenha) return { ok: false, code: "weak_password", message: problemaDaSenha };

  const resumo = await hashPassword(entrada.password);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [TRAVA_CADASTRO]);
    const { rows: contagem } = await client.query("SELECT count(*)::int AS n FROM users");
    if (contagem[0].n >= MAX_USERS) {
      await client.query("ROLLBACK");
      return { ok: false, code: "closed" };
    }
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email`,
      [nome, email, resumo]
    );
    await client.query("COMMIT");
    await registrarTentativa(pool, "register", ip, ip, true);
    return { ok: true, user: rows[0] };
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((erro as { code?: string })?.code === "23505") return { ok: false, code: "email_in_use" };
    throw erro;
  } finally {
    client.release();
  }
}
