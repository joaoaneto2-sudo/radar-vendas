// Coluna "Catálogo" do quadro de atalhos da loja: em qual grupo cada peça cai.
// Peça de atacado (do fabricante) e peça inativa ficam de fora, como no quadro da vitrine.
// Diferente do site: o catálogo não exige descrição nem estoque (peça sob encomenda entra com
// estoque 0). Só exige foto principal e preço maior que zero (regra da migração 017).

export interface PecaDoCatalogo {
  id: number;
  name?: string | null;
  sale_channel?: string | null;
  active?: boolean;
  show_catalog?: boolean;
  photo_url?: string | null;
  price?: number | string | null;
}

export interface QuadroDoCatalogo<T> {
  noCatalogo: T[];
  podemEntrar: T[];
}

const nomeDe = (p: PecaDoCatalogo) => (p.name ?? "").trim();
const porNome = (a: PecaDoCatalogo, b: PecaDoCatalogo) => nomeDe(a).localeCompare(nomeDe(b), "pt-BR") || a.id - b.id;

/** Peça pronta para o catálogo: foto principal e preço maior que zero. */
export function pecaProntaParaCatalogo(p: { photo_url?: string | null; price?: number | string | null }): boolean {
  const temFoto = !!p.photo_url && String(p.photo_url).trim() !== "";
  const preco = p.price === null || p.price === undefined || p.price === "" ? null : Number(p.price);
  const temPreco = preco !== null && Number.isFinite(preco) && preco > 0;
  return temFoto && temPreco;
}

export function montarQuadroDoCatalogo<T extends PecaDoCatalogo>(pecas: T[]): QuadroDoCatalogo<T> {
  const quadro: QuadroDoCatalogo<T> = { noCatalogo: [], podemEntrar: [] };
  for (const peca of [...pecas].sort(porNome)) {
    if (peca.sale_channel === "atacado" || peca.active === false) continue;
    if (peca.show_catalog === true) quadro.noCatalogo.push(peca);
    else if (pecaProntaParaCatalogo(peca)) quadro.podemEntrar.push(peca);
  }
  return quadro;
}
