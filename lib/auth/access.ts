import { isSecretUsable, verifySession } from "./session";

// Decide, para cada pedido que chega ao site, se deixa passar ou barra.
// É uma função "pura" (não depende do Next), por isso dá para testar direto.

export type AccessDecision =
  | { action: "allow" }
  | { action: "redirect-login"; next: string }
  | { action: "unauthorized" }
  | { action: "forbidden" }
  | { action: "misconfigured" };

// Páginas e rotas que funcionam sem estar logado (senão ninguém conseguiria entrar).
export const PUBLIC_PAGES = ["/login", "/primeiro-acesso"];
export const PUBLIC_API = ["/api/auth/login", "/api/auth/register", "/api/auth/logout"];

export interface AccessInput {
  pathname: string;
  search?: string;
  method: string;
  origin: string | null;
  host: string | null;
  cookie: string | undefined;
  secret: string | undefined;
}

export async function decideAccess(entrada: AccessInput): Promise<AccessDecision> {
  // Sem chave secreta configurada o sistema NÃO abre para ninguém (falha fechada).
  if (!isSecretUsable(entrada.secret)) return { action: "misconfigured" };

  // Proteção contra pedidos vindos de outros sites: em pedidos que alteram dados,
  // se o navegador informa a origem, ela precisa ser este mesmo site.
  const alteraDados = !["GET", "HEAD", "OPTIONS"].includes(entrada.method.toUpperCase());
  if (alteraDados && entrada.origin && entrada.host) {
    try {
      if (new URL(entrada.origin).host !== entrada.host) return { action: "forbidden" };
    } catch {
      return { action: "forbidden" };
    }
  }

  if (PUBLIC_PAGES.includes(entrada.pathname) || PUBLIC_API.includes(entrada.pathname)) {
    return { action: "allow" };
  }

  const sessao = await verifySession(entrada.cookie, entrada.secret);
  if (sessao) return { action: "allow" };

  if (entrada.pathname.startsWith("/api/")) return { action: "unauthorized" };
  return { action: "redirect-login", next: entrada.pathname + (entrada.search ?? "") };
}
