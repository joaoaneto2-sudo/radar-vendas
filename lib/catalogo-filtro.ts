// Filtros da tela "Gerar catálogo": tipo de peça, fabricante (só nesta tela interna), busca no nome
// e situação da marcação (todas, só marcadas, só desmarcadas).

export type SituacaoMarcacao = "todas" | "marcadas" | "desmarcadas";

export type FiltroCatalogo = {
  categorias: string[];
  fabricante: string;
  busca: string;
  situacao: SituacaoMarcacao;
};

export const SEM_FILTRO: FiltroCatalogo = { categorias: [], fabricante: "", busca: "", situacao: "todas" };

type PecaFiltravel = { id: number; name?: string | null; category?: string | null; manufacturer_name?: string | null };

export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** `ignorar` deixa de aplicar um dos filtros (usado para contar cada tipo de peça sem o filtro de tipo). */
export function filtrarPecas<T extends PecaFiltravel>(
  pecas: T[],
  filtro: FiltroCatalogo,
  selecionados: Set<number>,
  ignorar?: "categorias"
): T[] {
  const busca = semAcento(filtro.busca);
  return pecas.filter((p) => {
    if (ignorar !== "categorias" && filtro.categorias.length > 0 && !filtro.categorias.includes(p.category ?? "")) return false;
    if (filtro.fabricante && (p.manufacturer_name ?? "") !== filtro.fabricante) return false;
    if (busca && !semAcento(p.name ?? "").includes(busca)) return false;
    if (filtro.situacao === "marcadas" && !selecionados.has(p.id)) return false;
    if (filtro.situacao === "desmarcadas" && selecionados.has(p.id)) return false;
    return true;
  });
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
