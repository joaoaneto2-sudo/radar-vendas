import { describe, expect, it } from "vitest";
import {
  isSecretUsable,
  newSessionPayload,
  SESSION_MAX_AGE_SECONDS,
  signSession,
  verifySession,
} from "../../lib/auth/session";

const SEGREDO = "uma-chave-de-teste-bem-longa-com-mais-de-32-caracteres";
const AGORA = 1_800_000_000;
const usuario = { id: 7, name: "Fernanda" };

describe("sessão assinada", () => {
  it("cookie assinado com a chave certa é aceito e devolve quem é a pessoa", async () => {
    const token = await signSession(newSessionPayload(usuario, AGORA), SEGREDO);
    const sessao = await verifySession(token, SEGREDO, AGORA + 60);
    expect(sessao).toMatchObject({ uid: 7, name: "Fernanda" });
  });

  it("chave diferente: recusa", async () => {
    const token = await signSession(newSessionPayload(usuario, AGORA), SEGREDO);
    expect(await verifySession(token, SEGREDO + "x", AGORA + 60)).toBeNull();
  });

  it("cookie alterado (trocar o dono, por exemplo): recusa", async () => {
    const token = await signSession(newSessionPayload(usuario, AGORA), SEGREDO);
    const [corpo, assinatura] = token.split(".");
    const falso = btoa(JSON.stringify({ uid: 1, name: "Outro", iat: AGORA, exp: AGORA + 999999 }))
      .replace(/=+$/, "");
    expect(await verifySession(`${falso}.${assinatura}`, SEGREDO, AGORA + 60)).toBeNull();
    expect(await verifySession(`${corpo}.${assinatura}x`, SEGREDO, AGORA + 60)).toBeNull();
  });

  it("cookie vencido: recusa", async () => {
    const token = await signSession(newSessionPayload(usuario, AGORA), SEGREDO);
    expect(await verifySession(token, SEGREDO, AGORA + SESSION_MAX_AGE_SECONDS - 1)).not.toBeNull();
    expect(await verifySession(token, SEGREDO, AGORA + SESSION_MAX_AGE_SECONDS)).toBeNull();
  });

  it("lixo, vazio e formato errado: recusa sem dar erro", async () => {
    expect(await verifySession(undefined, SEGREDO)).toBeNull();
    expect(await verifySession("", SEGREDO)).toBeNull();
    expect(await verifySession("abc", SEGREDO)).toBeNull();
    expect(await verifySession("a.b.c", SEGREDO)).toBeNull();
    expect(await verifySession("!!!.???", SEGREDO)).toBeNull();
  });

  it("sem chave (ou chave curta), nada é aceito", async () => {
    const token = await signSession(newSessionPayload(usuario, AGORA), SEGREDO);
    expect(await verifySession(token, undefined, AGORA + 60)).toBeNull();
    expect(await verifySession(token, "curta", AGORA + 60)).toBeNull();
  });

  it("a chave precisa ter pelo menos 32 caracteres", () => {
    expect(isSecretUsable(undefined)).toBe(false);
    expect(isSecretUsable("")).toBe(false);
    expect(isSecretUsable("x".repeat(31))).toBe(false);
    expect(isSecretUsable("x".repeat(32))).toBe(true);
  });
});
