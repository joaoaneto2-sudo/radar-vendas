import { createHash, timingSafeEqual } from "node:crypto";

// Chave do Roberto (robô do WhatsApp) para as rotas /api/integracao/.
// Sem chave configurada, ou chave curta, ninguém entra (falha fechada).

export const MIN_TOKEN_LENGTH = 32;

export function tokenDaIntegracaoValido(cabecalho: string | null, esperado: string | undefined): boolean {
  if (!esperado || esperado.length < MIN_TOKEN_LENGTH) return false;
  if (!cabecalho) return false;
  const m = cabecalho.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  // Compara os resumos (mesmo tamanho) para não vazar nada pelo tempo de resposta.
  const a = createHash("sha256").update(m[1].trim()).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}
