import { formatBRL } from "./format";

// Regras da página de impressão do catálogo (A4 paisagem, de 1 a 10 peças por página).
// A foto de cada peça é classificada em products.catalog_photo (migração 018).

export type CatalogoFoto = { kind: "limpa" | "modelo"; fx: number; fy: number; zoom: number };

export type TipoPagina = "duplo-limpa" | "limpa-unica" | "duplo-modelo";

export const CAPAS = ["/catalogo/capas/capa-1.jpg", "/catalogo/capas/capa-2.jpg", "/catalogo/capas/capa-3.jpg"];

export const POR_PAGINA_MAX = 10;
export const POR_PAGINA_PADRAO = 1;

/** Aceita só inteiros de 1 a 10 (qualquer outra coisa, inclusive seleção antiga sem o campo, vira o padrão). */
export function porPaginaValido(valor: unknown): number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 1 && valor <= POR_PAGINA_MAX ? valor : POR_PAGINA_PADRAO;
}

export function agruparPorPagina<T>(itens: T[], porPagina: number): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < itens.length; i += porPagina) grupos.push(itens.slice(i, i + porPagina));
  return grupos;
}

// Cada peça da grade é um mini-spread com a mesma proporção da página (297 x 210). A área útil da
// página A4 paisagem mede 90 x 57,7 (em cqw, 1cqw = 1% da largura da página).
const ASPECTO = 297 / 210;
const AREA_LARGURA = 90;
const AREA_ALTURA = 57.7;
const ESPACO = 2.5;
const NOME_NA_PAGINA_CHEIA_MM = 4.46; // 1,5cqw da página de 1 peça

export type GradeDaPagina = {
  colunas: number;
  linhas: number;
  /** Largura de cada mini-spread, em cqw da página. */
  largura: number;
  /** Fator que amplia as letras do mini-spread para continuarem legíveis no papel (1 a 3). */
  texto: number;
};

export function gradeDaPagina(porPagina: number): GradeDaPagina {
  const n = Math.min(POR_PAGINA_MAX, Math.max(1, Math.trunc(porPagina)));
  let melhor = { colunas: 1, linhas: n, largura: 0 };
  for (let colunas = 1; colunas <= n; colunas++) {
    const linhas = Math.ceil(n / colunas);
    const larguraPorColuna = (AREA_LARGURA - (colunas - 1) * ESPACO) / colunas;
    const larguraPorLinha = ((AREA_ALTURA - (linhas - 1) * ESPACO) / linhas) * ASPECTO;
    const largura = Math.min(larguraPorColuna, larguraPorLinha);
    if (largura > melhor.largura + 0.01) melhor = { colunas, linhas, largura };
  }
  const alvoMm = n <= 4 ? 2.6 : 2;
  const escala = melhor.largura / 100;
  const texto = Math.min(3, Math.max(1, alvoMm / (NOME_NA_PAGINA_CHEIA_MM * escala)));
  return {
    colunas: melhor.colunas,
    linhas: melhor.linhas,
    largura: Math.floor(melhor.largura * 100) / 100,
    texto: Math.round(texto * 100) / 100,
  };
}

// Desenhos diferentes para a página de 1 peça (moldura quadrada, arco, círculo, espelhada, pílula e uma
// que atravessa a foto da modelo). Sem variar, todas as páginas usam o desenho 0.
export const DESENHOS_DA_PAGINA = 6;
const ORDEM_DOS_DESENHOS = [0, 2, 3, 1, 5, 4];

export function desenhoDaPagina(indice: number, variar: boolean): number {
  if (!variar) return 0;
  return ORDEM_DOS_DESENHOS[((Math.trunc(indice) % DESENHOS_DA_PAGINA) + DESENHOS_DA_PAGINA) % DESENHOS_DA_PAGINA];
}

export type PecaDaPagina = {
  catalog_photo?: CatalogoFoto | null;
  // Segunda foto (da modelo) para quando a peça tiver as duas; hoje nenhuma peça traz.
  photo_modelo_url?: string | null;
};

export function decidirPagina(peca: PecaDaPagina): TipoPagina {
  if (peca.catalog_photo?.kind === "modelo") return "duplo-modelo";
  return peca.photo_modelo_url ? "duplo-limpa" : "limpa-unica";
}

const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

/** Enquadramento seguro para o recorte: foco em 0-100% e zoom de 1 a 3 (sem classificação, centro e sem zoom). */
export function enquadramento(foto: CatalogoFoto | null | undefined): { fx: number; fy: number; zoom: number } {
  if (!foto) return { fx: 50, fy: 50, zoom: 1 };
  return { fx: limitar(foto.fx, 0, 100), fy: limitar(foto.fy, 0, 100), zoom: limitar(foto.zoom, 1, 3) };
}

/** Preço da legenda no formato 'R$ 129,90'; vazio quando a peça não tem preço. */
export function precoDaLegenda(preco: number | string | null | undefined): string {
  const texto = formatBRL(preco);
  return texto === "-" ? "" : texto;
}
