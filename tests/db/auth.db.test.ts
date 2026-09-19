import type { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loginUser, MAX_USERS, registerUser } from "../../lib/auth/service";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();
const CONVITE = "codigo-de-convite-de-teste";
const IP = "203.0.113.10";
const SENHA = "uma frase boa para senha";

describe.skipIf(!disponivel)("login e cadastro", () => {
  let pool: Pool;
  let apagar: () => Promise<void>;

  // Um banco novo para cada teste, para um não atrapalhar o outro.
  beforeEach(async () => {
    await apagar?.();
    const banco = await criarBancoDescartavel();
    pool = banco.pool;
    apagar = banco.apagar;
    await runMigrations(pool);
  });

  afterAll(async () => {
    await apagar?.();
  });

  const cadastro = (extra: Partial<Parameters<typeof registerUser>[1]> = {}) =>
    registerUser(
      pool,
      { name: "Fernanda", email: "fernanda@exemplo.com", password: SENHA, inviteCode: CONVITE, ip: IP, ...extra },
      { inviteCode: CONVITE }
    );

  describe("cadastro (primeiro acesso)", () => {
    it("com o código certo cria o usuário e guarda só o resumo da senha", async () => {
      const r = await cadastro();
      expect(r.ok).toBe(true);

      const { rows } = await pool.query("SELECT name, email, password_hash FROM users");
      expect(rows).toHaveLength(1);
      expect(rows[0].email).toBe("fernanda@exemplo.com");
      expect(rows[0].password_hash).not.toContain(SENHA);
      expect(rows[0].password_hash.startsWith("scrypt$")).toBe(true);
    });

    it("código de convite errado é recusado e nada é criado", async () => {
      const r = await cadastro({ inviteCode: "codigo-errado" });
      expect(r).toMatchObject({ ok: false, code: "invalid_invite" });
      const { rows } = await pool.query("SELECT count(*)::int AS n FROM users");
      expect(rows[0].n).toBe(0);
    });

    it("sem código de convite configurado no sistema, o cadastro fica fechado", async () => {
      const r = await registerUser(
        pool,
        { name: "X", email: "x@exemplo.com", password: SENHA, inviteCode: "qualquer", ip: IP },
        { inviteCode: undefined }
      );
      expect(r).toMatchObject({ ok: false, code: "not_configured" });
    });

    it("só existem duas vagas: a terceira pessoa é recusada", async () => {
      expect((await cadastro({ email: "a@exemplo.com" })).ok).toBe(true);
      expect((await cadastro({ email: "b@exemplo.com" })).ok).toBe(true);
      expect(MAX_USERS).toBe(2);
      expect(await cadastro({ email: "c@exemplo.com" })).toMatchObject({ ok: false, code: "closed" });
    });

    it("dois cadastros ao mesmo tempo não passam do limite", async () => {
      await cadastro({ email: "a@exemplo.com" });
      const resultados = await Promise.all([
        cadastro({ email: "b@exemplo.com" }),
        cadastro({ email: "c@exemplo.com" }),
        cadastro({ email: "d@exemplo.com" }),
      ]);
      expect(resultados.filter((r) => r.ok)).toHaveLength(1);
      const { rows } = await pool.query("SELECT count(*)::int AS n FROM users");
      expect(rows[0].n).toBe(2);
    });

    it("o mesmo e-mail não pode ser usado duas vezes, mesmo com maiúsculas diferentes", async () => {
      await cadastro({ email: "fernanda@exemplo.com" });
      expect(await cadastro({ email: "FERNANDA@Exemplo.com" })).toMatchObject({ ok: false, code: "email_in_use" });
    });

    it("recusa senha fraca, e-mail e nome inválidos", async () => {
      expect(await cadastro({ password: "curta" })).toMatchObject({ ok: false, code: "weak_password" });
      expect(await cadastro({ email: "sem-arroba" })).toMatchObject({ ok: false, code: "invalid_email" });
      expect(await cadastro({ name: "   " })).toMatchObject({ ok: false, code: "invalid_name" });
    });

    it("quem chuta o código de convite muitas vezes é bloqueado", async () => {
      for (let i = 0; i < 10; i++) {
        expect(await cadastro({ inviteCode: `chute-${i}` })).toMatchObject({ code: "invalid_invite" });
      }
      // Agora até o código certo é recusado, por um tempo.
      expect(await cadastro()).toMatchObject({ ok: false, code: "locked" });
    });
  });

  describe("login", () => {
    beforeEach(async () => {
      await cadastro();
    });

    it("e-mail e senha certos entram (o e-mail vale com qualquer maiúscula)", async () => {
      const r = await loginUser(pool, { email: "  FERNANDA@exemplo.com ", password: SENHA, ip: IP });
      expect(r).toMatchObject({ ok: true, user: { name: "Fernanda", email: "fernanda@exemplo.com" } });
      const { rows } = await pool.query("SELECT last_login_at FROM users");
      expect(rows[0].last_login_at).not.toBeNull();
    });

    it("senha errada e e-mail que não existe dão exatamente a mesma resposta", async () => {
      const senhaErrada = await loginUser(pool, { email: "fernanda@exemplo.com", password: "errada errada", ip: IP });
      const emailInexistente = await loginUser(pool, { email: "ninguem@exemplo.com", password: SENHA, ip: IP });
      expect(senhaErrada).toEqual({ ok: false, code: "invalid" });
      expect(emailInexistente).toEqual({ ok: false, code: "invalid" });
    });

    it("campos vazios são recusados", async () => {
      expect(await loginUser(pool, { email: "", password: "", ip: IP })).toEqual({ ok: false, code: "invalid" });
    });

    it("5 erros seguidos bloqueiam o e-mail por um tempo, até com a senha certa", async () => {
      for (let i = 0; i < 5; i++) {
        expect(await loginUser(pool, { email: "fernanda@exemplo.com", password: "errada errada", ip: IP })).toEqual({
          ok: false,
          code: "invalid",
        });
      }
      expect(await loginUser(pool, { email: "fernanda@exemplo.com", password: SENHA, ip: IP })).toEqual({
        ok: false,
        code: "locked",
      });
    });

    it("um acerto zera a contagem de erros", async () => {
      for (let i = 0; i < 4; i++) {
        await loginUser(pool, { email: "fernanda@exemplo.com", password: "errada errada", ip: IP });
      }
      expect((await loginUser(pool, { email: "fernanda@exemplo.com", password: SENHA, ip: IP })).ok).toBe(true);
      for (let i = 0; i < 4; i++) {
        expect(await loginUser(pool, { email: "fernanda@exemplo.com", password: "errada errada", ip: IP })).toEqual({
          ok: false,
          code: "invalid",
        });
      }
    });

    it("muitos erros vindos do mesmo lugar (IP) bloqueiam esse lugar, mesmo em e-mails diferentes", async () => {
      for (let i = 0; i < 20; i++) {
        await loginUser(pool, { email: `pessoa${i}@exemplo.com`, password: "errada errada", ip: "198.51.100.7" });
      }
      expect(
        await loginUser(pool, { email: "fernanda@exemplo.com", password: SENHA, ip: "198.51.100.7" })
      ).toEqual({ ok: false, code: "locked" });
      // De outro lugar, o login normal continua funcionando.
      expect((await loginUser(pool, { email: "fernanda@exemplo.com", password: SENHA, ip: IP })).ok).toBe(true);
    });
  });
});
