import { describe, expect, it } from "vitest";
import { dummyHash, hashPassword, validatePassword, verifyPassword } from "../../lib/auth/password";

describe("senha criptografada", () => {
  it("a senha certa confere e a errada não", async () => {
    const resumo = await hashPassword("minha frase secreta");
    expect(await verifyPassword("minha frase secreta", resumo)).toBe(true);
    expect(await verifyPassword("minha frase secreta!", resumo)).toBe(false);
    expect(await verifyPassword("", resumo)).toBe(false);
  });

  it("o resumo não contém a senha e muda a cada vez (sal aleatório)", async () => {
    const a = await hashPassword("minha frase secreta");
    const b = await hashPassword("minha frase secreta");
    expect(a).not.toContain("minha frase secreta");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
  });

  it("resumo estragado ou de outro formato nunca confere (e não dá erro)", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "texto-qualquer")).toBe(false);
    expect(await verifyPassword("x", "scrypt$a$b$c$d$e")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
  });

  it("existe um resumo de mentira para igualar o tempo quando o e-mail não existe", async () => {
    const resumo = await dummyHash();
    expect(await verifyPassword("qualquer coisa", resumo)).toBe(false);
  });
});

describe("regras da senha", () => {
  const email = "joao@exemplo.com";

  it("aceita frase de 10 caracteres ou mais", () => {
    expect(validatePassword("cafe com leite", email)).toBeNull();
    expect(validatePassword("1234567890", email)).toBeNull();
  });

  it("recusa senha curta, igual ao e-mail, ou caractere repetido", () => {
    expect(validatePassword("curta123", email)).toMatch(/pelo menos 10/);
    expect(validatePassword("JOAO@exemplo.com", email)).toMatch(/igual ao e-mail/);
    expect(validatePassword("aaaaaaaaaaaa", email)).toMatch(/repetido/);
    expect(validatePassword("x".repeat(201), email)).toMatch(/muito longa/);
  });
});
