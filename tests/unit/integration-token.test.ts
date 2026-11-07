import { describe, expect, it } from "vitest";
import { tokenDaIntegracaoValido } from "../../lib/auth/integration-token";
import { decideAccess } from "../../lib/auth/access";

const CHAVE = "chave-do-roberto-de-teste-com-mais-de-32-caracteres";

describe("chave do Roberto nas rotas de integração", () => {
  it("só aceita a chave certa, no formato Bearer", () => {
    expect(tokenDaIntegracaoValido(`Bearer ${CHAVE}`, CHAVE)).toBe(true);
    expect(tokenDaIntegracaoValido(`bearer   ${CHAVE}`, CHAVE)).toBe(true);
    expect(tokenDaIntegracaoValido(`Bearer ${CHAVE}x`, CHAVE)).toBe(false);
    expect(tokenDaIntegracaoValido(CHAVE, CHAVE)).toBe(false);
    expect(tokenDaIntegracaoValido(null, CHAVE)).toBe(false);
  });

  it("sem chave configurada, ou chave curta, ninguém entra", () => {
    expect(tokenDaIntegracaoValido("Bearer abc", undefined)).toBe(false);
    expect(tokenDaIntegracaoValido("Bearer curta", "curta")).toBe(false);
    expect(tokenDaIntegracaoValido("Bearer ", "")).toBe(false);
  });

  it("o porteiro deixa chegar na rota de integração (a rota confere a chave); o resto continua fechado", async () => {
    const base = {
      method: "POST",
      origin: null,
      host: "radar.exemplo.com",
      cookie: undefined,
      secret: "uma-chave-de-teste-bem-longa-com-mais-de-32-caracteres",
    };
    expect(await decideAccess({ ...base, pathname: "/api/integracao/vendas-whatsapp" })).toEqual({ action: "allow" });
    expect(await decideAccess({ ...base, pathname: "/api/sales" })).toEqual({ action: "unauthorized" });
    expect(await decideAccess({ ...base, pathname: "/api/integracaox" })).toEqual({ action: "unauthorized" });
  });
});
