import { beforeAll, describe, expect, it } from "vitest";
import { decideAccess, type AccessInput } from "../../lib/auth/access";
import { safeNextPath } from "../../lib/auth/redirect";
import { newSessionPayload, signSession } from "../../lib/auth/session";

const SEGREDO = "uma-chave-de-teste-bem-longa-com-mais-de-32-caracteres";
let cookieValido: string;

beforeAll(async () => {
  cookieValido = await signSession(newSessionPayload({ id: 1, name: "João" }), SEGREDO);
});

function pedido(parcial: Partial<AccessInput>): AccessInput {
  return {
    pathname: "/",
    method: "GET",
    origin: null,
    host: "radar.exemplo.com",
    cookie: undefined,
    secret: SEGREDO,
    ...parcial,
  };
}

describe("porteiro: quem pode passar", () => {
  it("sem login, páginas mandam para a tela de entrada lembrando para onde a pessoa ia", async () => {
    expect(await decideAccess(pedido({ pathname: "/relatorio", search: "?de=2026-09-01" }))).toEqual({
      action: "redirect-login",
      next: "/relatorio?de=2026-09-01",
    });
    expect(await decideAccess(pedido({ pathname: "/" }))).toEqual({ action: "redirect-login", next: "/" });
  });

  it("sem login, TODAS as rotas internas respondem 401", async () => {
    for (const rota of [
      "/api/sales",
      "/api/sales/export",
      "/api/clients",
      "/api/products",
      "/api/upload",
      "/api/sellers",
      "/api/auth/me",
    ]) {
      expect(await decideAccess(pedido({ pathname: rota }))).toEqual({ action: "unauthorized" });
    }
  });

  it("com login válido, tudo passa", async () => {
    for (const rota of ["/", "/relatorio", "/cadastros", "/api/sales", "/api/sales/export"]) {
      expect(await decideAccess(pedido({ pathname: rota, cookie: cookieValido }))).toEqual({ action: "allow" });
    }
  });

  it("a tela de entrada, o primeiro acesso e as rotas de login ficam abertas", async () => {
    for (const rota of ["/login", "/primeiro-acesso", "/api/auth/login", "/api/auth/register", "/api/auth/logout"]) {
      expect(await decideAccess(pedido({ pathname: rota, method: rota.startsWith("/api") ? "POST" : "GET" }))).toEqual({
        action: "allow",
      });
    }
  });

  it("cookie falso ou de outra chave não vale", async () => {
    const deOutraChave = await signSession(
      newSessionPayload({ id: 1, name: "Intruso" }),
      "outra-chave-secreta-tambem-bem-longa-123456"
    );
    expect(await decideAccess(pedido({ pathname: "/api/sales", cookie: deOutraChave }))).toEqual({
      action: "unauthorized",
    });
    expect(await decideAccess(pedido({ pathname: "/api/sales", cookie: "qualquer.coisa" }))).toEqual({
      action: "unauthorized",
    });
  });

  it("sem chave secreta configurada, o sistema fecha para todos (inclusive a tela de entrada)", async () => {
    expect(await decideAccess(pedido({ pathname: "/", secret: undefined, cookie: cookieValido }))).toEqual({
      action: "misconfigured",
    });
    expect(await decideAccess(pedido({ pathname: "/login", secret: "curta" }))).toEqual({
      action: "misconfigured",
    });
  });
});

describe("porteiro: pedidos vindos de outro site", () => {
  it("pedido que altera dados vindo de outra origem é recusado, mesmo com login", async () => {
    const r = await decideAccess(
      pedido({ pathname: "/api/sales", method: "POST", origin: "https://site-do-mal.com", cookie: cookieValido })
    );
    expect(r).toEqual({ action: "forbidden" });
  });

  it("pedido que altera dados vindo do próprio site passa", async () => {
    const r = await decideAccess(
      pedido({ pathname: "/api/sales", method: "POST", origin: "https://radar.exemplo.com", host: "radar.exemplo.com", cookie: cookieValido })
    );
    expect(r).toEqual({ action: "allow" });
  });

  it("origem ilegível é recusada; leitura (GET) não é afetada", async () => {
    expect(
      await decideAccess(pedido({ pathname: "/api/sales", method: "DELETE", origin: "isto-nao-e-url", cookie: cookieValido }))
    ).toEqual({ action: "forbidden" });
    expect(
      await decideAccess(pedido({ pathname: "/api/sales", method: "GET", origin: "https://outro.com", cookie: cookieValido }))
    ).toEqual({ action: "allow" });
  });

  it("o login também recusa pedido de outra origem", async () => {
    const r = await decideAccess(pedido({ pathname: "/api/auth/login", method: "POST", origin: "https://site-do-mal.com" }));
    expect(r).toEqual({ action: "forbidden" });
  });
});

describe("para onde voltar depois do login", () => {
  it("aceita só endereços do próprio site", () => {
    expect(safeNextPath("/relatorio")).toBe("/relatorio");
    expect(safeNextPath("/relatorio?de=2026-09-01")).toBe("/relatorio?de=2026-09-01");
  });

  it("recusa endereços de outros sites e volta para a página inicial", () => {
    expect(safeNextPath("https://site-do-mal.com")).toBe("/");
    expect(safeNextPath("//site-do-mal.com")).toBe("/");
    expect(safeNextPath("/\\site-do-mal.com")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("relatorio")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("não volta para a própria tela de entrada (evita ciclo)", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/primeiro-acesso")).toBe("/");
  });
});
