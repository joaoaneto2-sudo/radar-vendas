// Fotos da peça no cadastro: a primeira é o destaque (photo_url) e as outras acompanham (product_photos).
// Aqui só as regras do que vem da tela; a gravação no banco fica em lib/product-photos-db.ts.

export const MAX_FOTOS_EXTRAS = 12;

export interface Troca {
  de: string; // endereço da foto antes (girada, trocada)
  para: string; // endereço da foto depois
}

export interface FotosDoCorpo {
  extras: string[] | null; // null = a tela não mandou a lista: as fotos extras ficam como estão
  trocas: Troca[]; // fotos que mudaram de endereço mas continuam sendo "a mesma foto" (mantêm a vaga na vitrine)
}

export type ResultadoDasFotos = { ok: true; value: FotosDoCorpo } | { ok: false; error: string; message: string };

const ehEndereco = (v: unknown): v is string => typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim());

/** Lê extra_photos e photo_swaps do corpo do pedido (as chaves que não vieram não mudam nada). */
export function lerFotosDoCorpo(body: Record<string, unknown>): ResultadoDasFotos {
  const principal = typeof body.photo_url === "string" ? body.photo_url.trim() : "";

  let extras: string[] | null = null;
  if (body.extra_photos !== undefined) {
    if (!Array.isArray(body.extra_photos)) {
      return { ok: false, error: "invalid_photos", message: "A lista de fotos não é válida." };
    }
    const vistas = new Set<string>(principal ? [principal] : []);
    extras = [];
    for (const item of body.extra_photos) {
      if (!ehEndereco(item)) return { ok: false, error: "invalid_url", message: "Uma das fotos tem endereço inválido." };
      const url = item.trim();
      if (vistas.has(url)) continue; // a mesma foto duas vezes conta uma só
      vistas.add(url);
      extras.push(url);
    }
    if (extras.length > MAX_FOTOS_EXTRAS) {
      return { ok: false, error: "too_many", message: `Cada peça pode ter até ${MAX_FOTOS_EXTRAS} fotos extras, além do destaque.` };
    }
  }

  const trocas: Troca[] = [];
  if (Array.isArray(body.photo_swaps)) {
    for (const t of body.photo_swaps.slice(0, 40)) {
      const item = (t ?? {}) as Record<string, unknown>;
      if (ehEndereco(item.de) && ehEndereco(item.para) && item.de.trim() !== item.para.trim()) {
        trocas.push({ de: item.de.trim(), para: item.para.trim() });
      }
    }
  }
  return { ok: true, value: { extras, trocas } };
}
