// Filtros da tela "Criar catálogo": tipo de peça, fabricante, faixa de preço, busca no nome, só com
// estoque, só com foto, só as marcadas para o catálogo e situação da marcação (todas, só marcadas,
// só desmarcadas). Também sorteia peças ao acaso entre as que estão à mostra.

export type SituacaoMarcacao = "todas" | "marcadas" | "desmarcadas";

export type FiltroCatalogo = {
  categorias: string[];
  fabricante: string;
  busca: string;
  situacao: SituacaoMarcacao;
  precoMin: string; // texto digitado ("" = sem limite); aceita vírgula: "89,90"
  precoMax: string;
  soComEstoque: boolean;
  soComFoto: boolean;
  soDoCatalogo: boolean; // só as peças com o botão "Catálogo" ligado no cadastro de produtos
};

export const SEM_FILTRO: FiltroCatalogo = {
  categorias: [],
  fabricante: "",
  busca: "",
  situacao: "todas",
  precoMin: "",
  precoMax: "",
  soComEstoque: false,
  soComFoto: false,
  soDoCatalogo: false,
};

type PecaFiltravel = {
  id: number;
  name?: string | null;
  category?: string | null;
  manufacturer_name?: string | null;
  price?: number | string | null;
  stock_qty?: number | null;
  photo_url?: string | null;
  show_catalog?: boolean | null;
};

export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "89,90" ou "89.90" vira 89.9; vazio ou inválido vira null (sem limite). */
export function lerValor(texto: string): number | null {
  const t = texto.trim().replace(/\./g, (m, i, s) => (s.includes(",") ? "" : m)).replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** True quando algum filtro está ligado (usado para mostrar "Limpar filtros"). */
export function temFiltro(f: FiltroCatalogo): boolean {
  return (
    f.categorias.length > 0 ||
    f.fabricante !== "" ||
    f.busca.trim() !== "" ||
    f.situacao !== "todas" ||
    lerValor(f.precoMin) !== null ||
    lerValor(f.precoMax) !== null ||
    f.soComEstoque ||
    f.soComFoto ||
    f.soDoCatalogo
  );
}

/** `ignorar` deixa de aplicar um dos filtros (usado para contar cada tipo de peça sem o filtro de tipo). */
export function filtrarPecas<T extends PecaFiltravel>(
  pecas: T[],
  filtro: FiltroCatalogo,
  selecionados: Set<number>,
  ignorar?: "categorias"
): T[] {
  const busca = semAcento(filtro.busca);
  const min = lerValor(filtro.precoMin);
  const max = lerValor(filtro.precoMax);
  return pecas.filter((p) => {
    if (ignorar !== "categorias" && filtro.categorias.length > 0 && !filtro.categorias.includes(p.category ?? "")) return false;
    if (filtro.fabricante && (p.manufacturer_name ?? "") !== filtro.fabricante) return false;
    if (busca && !semAcento(p.name ?? "").includes(busca)) return false;
    if (min !== null || max !== null) {
      const preco = p.price === null || p.price === undefined || p.price === "" ? null : Number(p.price);
      if (preco === null || !Number.isFinite(preco)) return false; // sem preço não entra numa faixa de preço
      if (min !== null && preco < min) return false;
      if (max !== null && preco > max) return false;
    }
    if (filtro.soComEstoque && (p.stock_qty ?? 0) <= 0) return false;
    if (filtro.soComFoto && !p.photo_url) return false;
    if (filtro.soDoCatalogo && !p.show_catalog) return false;
    if (filtro.situacao === "marcadas" && !selecionados.has(p.id)) return false;
    if (filtro.situacao === "desmarcadas" && selecionados.has(p.id)) return false;
    return true;
  });
}

/** Sorteia até `quantidade` peças diferentes (embaralhamento de Fisher-Yates). `acaso` devolve [0,1). */
export function sortearPecas<T>(pecas: T[], quantidade: number, acaso: () => number = Math.random): T[] {
  const copia = [...pecas];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(acaso() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, Math.max(0, Math.floor(quantidade)));
}

export type ContagemMarcacao = { nome: string; total: number; marcadas: number };

/** Por nome (tipo ou fabricante): quantas peças existem e quantas dessas estão marcadas. */
export function contarMarcacao<T extends { id: number }>(
  pecas: T[],
  valor: (p: T) => string | null | undefined,
  selecionados: Set<number>
): ContagemMarcacao[] {
  const mapa = new Map<string, ContagemMarcacao>();
  for (const p of pecas) {
    const nome = valor(p);
    if (!nome) continue;
    const atual = mapa.get(nome) ?? { nome, total: 0, marcadas: 0 };
    atual.total++;
    if (selecionados.has(p.id)) atual.marcadas++;
    mapa.set(nome, atual);
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
