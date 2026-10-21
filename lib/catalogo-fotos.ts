// Fotos de cada peça no catálogo: quais a peça tem, quais vão para o PDF e em que ordem.
// Ordem das fotos que a peça tem: a principal, a da modelo (se houver) e as outras, como estão no cadastro.
// A posição no PDF vem da ordem escolhida: a primeira é a foto de destaque (emoldurada, ao lado do nome) e as
// outras formam a área de fotos ao lado.

export const FOTOS_POR_PECA_MAX = 4;

export type PadraoDeFotos = "padrao" | 1 | 2 | 3 | 4;

export interface FotoDisponivel {
  url: string;
  rotulo: string; // "Principal", "Modelo", "Foto 3"...
}

export interface PecaComFotos {
  photo_url?: string | null;
  modelo_photo_url?: string | null;
  catalog_photo?: { kind: "limpa" | "modelo" } | null;
  galeria?: { url: string; kind: "limpa" | "modelo" | null }[] | null;
}

const temTexto = (v: string | null | undefined): v is string => typeof v === "string" && v.trim() !== "";

/** Todas as fotos que a peça tem, sem repetir, na ordem: principal, modelo, outras. */
export function fotosDisponiveis(p: PecaComFotos): FotoDisponivel[] {
  const lista: FotoDisponivel[] = [];
  const vistas = new Set<string>();
  const juntar = (url: string | null | undefined, rotulo: string) => {
    if (!temTexto(url) || vistas.has(url)) return;
    vistas.add(url);
    lista.push({ url, rotulo });
  };
  // Se a foto principal já é a da modelo (peça só com foto de modelo), ela se chama "Modelo".
  juntar(p.photo_url, p.catalog_photo?.kind === "modelo" ? "Modelo" : "Principal");
  juntar(p.modelo_photo_url, "Modelo");
  for (const g of p.galeria ?? []) juntar(g.url, g.kind === "modelo" ? "Modelo" : `Foto ${lista.length + 1}`);
  return lista;
}

/**
 * Fotos que vão para o catálogo. Sem mudança (padrão e sem escolha própria): devolve undefined e o catálogo faz o
 * de sempre (close + modelo). Com número (1 a 4): as primeiras fotos da peça. Com escolha própria: a ordem escolhida
 * (só vale foto que a peça tem, até 4).
 */
export function fotosEscolhidas(p: PecaComFotos, padrao: PadraoDeFotos, escolhaPropria?: string[] | null): string[] | undefined {
  const disponiveis = fotosDisponiveis(p).map((f) => f.url);
  if (escolhaPropria && escolhaPropria.length > 0) {
    const validas = escolhaPropria.filter((u, i) => disponiveis.includes(u) && escolhaPropria.indexOf(u) === i).slice(0, FOTOS_POR_PECA_MAX);
    if (validas.length > 0) return validas;
  }
  if (padrao === "padrao") return undefined;
  return disponiveis.slice(0, padrao);
}

/** Fotos que aparecem de verdade (sem escolha: a principal e, se houver, a da modelo). */
export function fotosDaPagina(p: PecaComFotos, escolhidas: string[] | undefined): string[] {
  if (escolhidas && escolhidas.length > 0) return escolhidas;
  return fotosDisponiveis(p)
    .filter((f, i) => i === 0 || f.rotulo === "Modelo")
    .slice(0, 2)
    .map((f) => f.url);
}
