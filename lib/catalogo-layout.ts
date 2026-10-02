import { formatBRL } from "./format";

// Regras da página de impressão do catálogo (A4 paisagem, uma peça por página).
// A foto de cada peça é classificada em products.catalog_photo (migração 018).

export type CatalogoFoto = { kind: "limpa" | "modelo"; fx: number; fy: number; zoom: number };

export type TipoPagina = "duplo-limpa" | "limpa-unica" | "duplo-modelo";

export const CAPAS = ["/catalogo/capas/capa-1.jpg", "/catalogo/capas/capa-2.jpg", "/catalogo/capas/capa-3.jpg"];

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
