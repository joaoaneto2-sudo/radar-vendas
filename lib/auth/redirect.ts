/**
 * Depois do login a pessoa volta para a página que queria abrir. Só aceitamos
 * endereços DENTRO do próprio site (começam com uma barra). Qualquer outra coisa
 * volta para a página inicial, para ninguém ser mandado para um site falso.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.startsWith("/login") || next.startsWith("/primeiro-acesso")) return "/";
  return next;
}
