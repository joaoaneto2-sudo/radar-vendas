import { faltaParaPublicar } from "./store-rules";

// Quadro de atalhos da loja (no alto de Produtos e cadastros): em qual grupo cada peça aparece.
// Cada peça aparece em UM lugar só, por esta ordem de prioridade:
//   1. Precisam de atenção: esgotada ou faltando foto, preço ou descrição;
//   2. No carrossel;  3. No site;  4. Podem entrar (completa, com estoque, ainda fora do site).
// Peça de atacado (do fabricante) e peça inativa ficam de fora.

export interface PecaDoQuadro {
  id: number;
  name?: string | null;
  sale_channel?: string | null;
  active?: boolean;
  show_online?: boolean;
  featured?: boolean;
  stock_qty: number;
  photo_url?: string | null;
  price?: number | string | null;
  public_description?: string | null;
}

export interface CartaoDeAtencao<T> {
  peca: T;
  motivos: string[]; // ex.: "Esgotada", "Falta: descrição"
  noSite: boolean; // já está no site (continua lá, mesmo esgotada)
}

export interface QuadroDaVitrine<T> {
  carrossel: T[];
  noSite: T[];
  podemEntrar: T[];
  atencao: CartaoDeAtencao<T>[];
}

const nomeDe = (p: PecaDoQuadro) => (p.name ?? "").trim();
const porNome = (a: PecaDoQuadro, b: PecaDoQuadro) => nomeDe(a).localeCompare(nomeDe(b), "pt-BR") || a.id - b.id;

export function textoDaFalta(falta: string[]): string {
  return `${falta.length === 1 ? "Falta" : "Faltam"}: ${falta.join(", ")}`;
}

export function montarQuadroDaVitrine<T extends PecaDoQuadro>(pecas: T[]): QuadroDaVitrine<T> {
  const quadro: QuadroDaVitrine<T> = { carrossel: [], noSite: [], podemEntrar: [], atencao: [] };

  for (const peca of [...pecas].sort(porNome)) {
    if (peca.sale_channel === "atacado" || peca.active === false) continue;

    const motivos: string[] = [];
    if (peca.stock_qty <= 0) motivos.push("Esgotada");
    const falta = faltaParaPublicar({ photoUrl: peca.photo_url, price: peca.price, description: peca.public_description });
    if (falta.length > 0) motivos.push(textoDaFalta(falta));

    const noSite = peca.show_online === true;
    if (motivos.length > 0) quadro.atencao.push({ peca, motivos, noSite });
    else if (noSite && peca.featured === true) quadro.carrossel.push(peca);
    else if (noSite) quadro.noSite.push(peca);
    else quadro.podemEntrar.push(peca);
  }
  return quadro;
}
