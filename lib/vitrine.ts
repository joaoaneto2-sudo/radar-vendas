// Vitrine do site: regras puras (sem banco) para escolher a foto de cada área da loja.
// A foto escolhida sempre tem de ser uma foto da peça (a principal ou uma extra).

export const MAX_CARROSSEL = 8;

export interface PecaDaVitrine {
  id: number;
  name: string | null;
  category: string | null;
  publicada: boolean; // varejo, ativa e "No site"
  fotos: string[]; // principal primeiro, sem repetição
}

export interface VagaCarrossel {
  product_id: number;
  photo_url: string;
}

export interface VagaCategoria {
  category: string;
  product_id: number;
  photo_url: string;
}

export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string; message: string };

const erro = (error: string, message: string) => ({ ok: false as const, error, message });
const nomeDe = (p: PecaDaVitrine) => p.name?.trim() || `peça ${p.id}`;

/** Todas as fotos da peça, a principal primeiro, sem repetir e sem vazias. */
export function fotosDaPeca(principal: string | null | undefined, extras: string[]): string[] {
  const todas = [principal, ...extras].filter((f): f is string => typeof f === "string" && f.trim() !== "");
  return Array.from(new Set(todas));
}

/** Lista do carrossel na ordem escolhida: no máximo 8, sem peça repetida, só peças publicadas e fotos delas. */
export function validarCarrossel(entrada: unknown, pecas: PecaDaVitrine[]): Resultado<VagaCarrossel[]> {
  if (!Array.isArray(entrada)) return erro("invalid_list", "A lista do carrossel veio em formato inválido.");
  if (entrada.length > MAX_CARROSSEL) return erro("too_many", `O carrossel aceita no máximo ${MAX_CARROSSEL} destaques.`);

  const vistos = new Set<number>();
  const vagas: VagaCarrossel[] = [];
  for (const item of entrada) {
    const productId = Number((item as { product_id?: unknown })?.product_id);
    const photoUrl = (item as { photo_url?: unknown })?.photo_url;
    if (!Number.isInteger(productId) || typeof photoUrl !== "string" || photoUrl.trim() === "") {
      return erro("invalid_item", "Há um destaque sem peça ou sem foto.");
    }
    if (vistos.has(productId)) return erro("duplicate_piece", "A mesma peça não pode aparecer duas vezes no carrossel.");
    vistos.add(productId);

    const peca = pecas.find((p) => p.id === productId);
    if (!peca) return erro("piece_not_found", "Uma das peças escolhidas não existe mais.");
    if (!peca.publicada) {
      return erro("piece_not_published", `"${nomeDe(peca)}" não está no site. Publique a peça antes de colocá-la no carrossel.`);
    }
    if (!peca.fotos.includes(photoUrl)) return erro("photo_not_from_piece", `Essa foto não é de "${nomeDe(peca)}".`);
    vagas.push({ product_id: productId, photo_url: photoUrl });
  }
  return { ok: true, value: vagas };
}

/** Foto de uma categoria: de uma peça publicada daquela categoria, e uma foto dela. */
export function validarCategoria(entrada: unknown, pecas: PecaDaVitrine[]): Resultado<VagaCategoria> {
  const categoria = typeof (entrada as { category?: unknown })?.category === "string" ? (entrada as { category: string }).category.trim() : "";
  const productId = Number((entrada as { product_id?: unknown })?.product_id);
  const photoUrl = (entrada as { photo_url?: unknown })?.photo_url;
  if (categoria === "" || !Number.isInteger(productId) || typeof photoUrl !== "string" || photoUrl.trim() === "") {
    return erro("invalid_item", "Escolha a categoria, a peça e a foto.");
  }
  const peca = pecas.find((p) => p.id === productId);
  if (!peca) return erro("piece_not_found", "A peça escolhida não existe mais.");
  if (!peca.publicada) {
    return erro("piece_not_published", `"${nomeDe(peca)}" não está no site. Publique a peça antes de usar a foto dela.`);
  }
  if (peca.category !== categoria) return erro("wrong_category", `"${nomeDe(peca)}" não é da categoria ${categoria}.`);
  if (!peca.fotos.includes(photoUrl)) return erro("photo_not_from_piece", `Essa foto não é de "${nomeDe(peca)}".`);
  return { ok: true, value: { category: categoria, product_id: productId, photo_url: photoUrl } };
}

/** Texto para avisar onde uma foto apagada também saiu da vitrine. */
export function avisoDeVagasRemovidas(vagas: { area: string; category: string | null }[]): string | null {
  if (vagas.length === 0) return null;
  const nomes = vagas.map((v) => (v.area === "carrossel" ? "carrossel" : `categoria ${v.category}`));
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return `Essa foto também saiu da vitrine do site: ${lista}.`;
}
