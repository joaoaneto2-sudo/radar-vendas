// Imagens do catálogo em PDF. As fotos originais (muitas em PNG de 2 MB) fazem o PDF pesar centenas de MB e os leitores de
// celular, do Drive e do WhatsApp deixam páginas em branco, cortadas ou só com o fundo borrado. Por isso a página de impressão
// pede cada foto já redimensionada e em JPEG a uma rota do Radar (/api/catalogo-imagem), em vez de usar o arquivo original.

export type QualidadeDoPdf = "leve" | "alta";
export type UsoDaImagem = "modelo" | "close" | "mosaico" | "capa";
export type ModoDaImagem = "foto" | "fundo" | "moldura";

export const QUALIDADES_DO_PDF: Record<QualidadeDoPdf, { nome: string; descricao: string; jpeg: number }> = {
  leve: { nome: "Leve", descricao: "Arquivo pequeno, abre rápido no celular e no WhatsApp (recomendado para enviar a clientes).", jpeg: 74 },
  alta: { nome: "Alta", descricao: "Fotos mais nítidas e arquivo bem maior. Melhor para imprimir.", jpeg: 88 },
};

// Largura em pixels de cada foto conforme onde ela aparece (página inteira ou grade de várias peças).
const LARGURAS: Record<QualidadeDoPdf, Record<UsoDaImagem, { normal: number; mini: number }>> = {
  leve: { modelo: { normal: 1100, mini: 640 }, close: { normal: 900, mini: 560 }, mosaico: { normal: 800, mini: 520 }, capa: { normal: 1800, mini: 1800 } },
  alta: { modelo: { normal: 1800, mini: 1000 }, close: { normal: 1400, mini: 800 }, mosaico: { normal: 1200, mini: 700 }, capa: { normal: 2600, mini: 2600 } },
};

export const qualidadeValida = (q: unknown): QualidadeDoPdf => (q === "alta" ? "alta" : "leve");

export const larguraDaImagem = (qualidade: QualidadeDoPdf, uso: UsoDaImagem, mini: boolean): number => LARGURAS[qualidade][uso][mini ? "mini" : "normal"];

export const LARGURA_MINIMA = 160;
export const LARGURA_MAXIMA = 3000;

/** Foto de close já montada na moldura (foto inteira com bordas suaves sobre o fundo borrado), numa imagem só. `proporcao` = largura / altura da moldura na página. */
export function urlDaMoldura(url: string | null | undefined, opcoes: { largura: number; proporcao: number; qualidade: QualidadeDoPdf }): string {
  if (!url) return "";
  const parametros = new URLSearchParams({
    u: url,
    w: String(Math.round(opcoes.largura)),
    q: String(QUALIDADES_DO_PDF[opcoes.qualidade].jpeg),
    modo: "moldura",
    p: String(Math.round(opcoes.proporcao * 100) / 100),
  });
  return `/api/catalogo-imagem?${parametros.toString()}`;
}

/** Endereço da foto já redimensionada. Sem foto (vazio) devolve vazio. `fundo` = cópia pequena e borrada para o fundo da moldura. */
export function urlDaImagem(url: string | null | undefined, opcoes: { largura: number; qualidade: QualidadeDoPdf; modo?: ModoDaImagem }): string {
  if (!url) return "";
  const parametros = new URLSearchParams({ u: url, w: String(Math.round(opcoes.largura)), q: String(QUALIDADES_DO_PDF[opcoes.qualidade].jpeg) });
  if (opcoes.modo === "fundo") parametros.set("modo", "fundo");
  return `/api/catalogo-imagem?${parametros.toString()}`;
}

const CAMINHOS_DO_SITE = ["/catalogo/", "/estoque/", "/uploads-dev/", "/marca/"];
const FINAL_DO_ARMAZENAMENTO = ".public.blob.vercel-storage.com";

/**
 * De onde a rota pode buscar a foto. Só aceita arquivos do próprio site (pastas conhecidas) e do armazenamento de fotos do Radar:
 * qualquer outro endereço é recusado, para a rota não virar um jeito de buscar coisas de outros lugares.
 * Devolve o caminho no próprio site ("site") ou o endereço completo do armazenamento ("armazenamento").
 */
export function origemDaImagem(u: string | null | undefined, hostDoSite: string): { tipo: "site"; caminho: string } | { tipo: "armazenamento"; url: string } | null {
  if (!u || u.length > 2000) return null;
  const caminhoOk = (c: string) => c.startsWith("/") && !c.startsWith("//") && !c.includes("..") && !c.includes("\\") && CAMINHOS_DO_SITE.some((p) => c.startsWith(p));
  if (u.startsWith("/")) return caminhoOk(u) ? { tipo: "site", caminho: u } : null;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.host === hostDoSite) {
    const caminho = url.pathname + url.search;
    return caminhoOk(url.pathname) ? { tipo: "site", caminho } : null;
  }
  if (url.protocol === "https:" && url.hostname.endsWith(FINAL_DO_ARMAZENAMENTO) && url.hostname.length > FINAL_DO_ARMAZENAMENTO.length) return { tipo: "armazenamento", url: url.toString() };
  return null;
}

/** Largura pedida, corrigida para um valor que a rota aceita. */
export function larguraValida(w: string | null | undefined, padrao = 1100): number {
  const n = Math.round(Number(w));
  if (!Number.isFinite(n) || n <= 0) return padrao;
  return Math.min(LARGURA_MAXIMA, Math.max(LARGURA_MINIMA, n));
}

export function jpegValido(q: string | null | undefined, padrao = 74): number {
  const n = Math.round(Number(q));
  if (!Number.isFinite(n) || n <= 0) return padrao;
  return Math.min(92, Math.max(50, n));
}
