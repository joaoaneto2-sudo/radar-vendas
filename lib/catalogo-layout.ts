import { formatBRL } from "./format";

// Regras da página de impressão do catálogo (A4 paisagem, de 1 a 10 peças por página).
// A foto de cada peça é classificada em products.catalog_photo (migração 018).

export type CatalogoFoto = { kind: "limpa" | "modelo"; fx: number; fy: number; zoom: number };

export type TipoPagina = "duplo-limpa" | "limpa-unica" | "duplo-modelo";

export const CAPAS = ["/catalogo/capas/capa-1.jpg", "/catalogo/capas/capa-2.jpg", "/catalogo/capas/capa-3.jpg"];

export const POR_PAGINA_MAX = 10;
export const POR_PAGINA_PADRAO = 4;

/** Aceita só inteiros de 1 a 10 (qualquer outra coisa, inclusive seleção antiga sem o campo, vira o padrão). */
export function porPaginaValido(valor: unknown): number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 1 && valor <= POR_PAGINA_MAX ? valor : POR_PAGINA_PADRAO;
}

export function agruparPorPagina<T>(itens: T[], porPagina: number): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < itens.length; i += porPagina) grupos.push(itens.slice(i, i + porPagina));
  return grupos;
}

// Colunas x linhas de cada quantidade (de 2 a 10), na página A4 paisagem (100 x 70,7 cqw).
const GRADES: Record<number, [number, number]> = {
  2: [2, 1], 3: [3, 1], 4: [2, 2], 5: [3, 2], 6: [3, 2], 7: [4, 2], 8: [4, 2], 9: [5, 2], 10: [5, 2],
};

const AREA_LARGURA = 90;
const AREA_ALTURA = 57.7;
const ESPACO = 2.5;
const ALTURA_LEGENDA = 12;

export type GradeDaPagina = {
  colunas: number;
  linhas: number;
  /** 'lado' = legenda ao lado da foto (células largas); 'baixo' = legenda embaixo. */
  legenda: "lado" | "baixo";
  /** Lado da foto quadrada, em cqw (1cqw = 1% da largura da página). */
  foto: number;
  /** Fator para encolher as letras quando cabem mais peças na página. */
  escala: number;
};

export function gradeDaPagina(porPagina: number): GradeDaPagina {
  const [colunas, linhas] = GRADES[porPagina] ?? GRADES[POR_PAGINA_PADRAO];
  const largura = (AREA_LARGURA - (colunas - 1) * ESPACO) / colunas;
  const altura = (AREA_ALTURA - (linhas - 1) * ESPACO) / linhas;
  const legenda = largura / altura >= 1.4 ? "lado" : "baixo";
  const foto = legenda === "lado" ? altura : Math.min(largura, altura - ALTURA_LEGENDA);
  const escala = porPagina <= 4 ? 1 : porPagina <= 6 ? 0.85 : 0.72;
  return { colunas, linhas, legenda, foto: Math.round(foto * 100) / 100, escala };
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
