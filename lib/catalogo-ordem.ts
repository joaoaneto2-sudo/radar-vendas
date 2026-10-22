// Ordem das peças no catálogo: a lista que o João vê na tela "Criar catálogo" é a ordem das páginas.
// O que ele não mexeu segue a ordem da lista de peças; quem foi marcado depois entra no fim.

export type CriterioDeOrdem = "preco-menor" | "preco-maior" | "nome" | "tipo" | "fabricante" | "aleatoria";

export const CRITERIOS_DE_ORDEM: { id: CriterioDeOrdem; nome: string }[] = [
  { id: "preco-menor", nome: "Do mais barato ao mais caro" },
  { id: "preco-maior", nome: "Do mais caro ao mais barato" },
  { id: "nome", nome: "Nome (A a Z)" },
  { id: "tipo", nome: "Por tipo (brincos, colares...)" },
  { id: "fabricante", nome: "Por fabricante" },
  { id: "aleatoria", nome: "Embaralhar" },
];

type PecaParaOrdenar = {
  id: number;
  name?: string | null;
  category?: string | null;
  price?: number | string | null;
  manufacturer_name?: string | null;
};

const comparar = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").localeCompare(b ?? "", "pt-BR", { sensitivity: "base" });
const preco = (p: PecaParaOrdenar) => (p.price === null || p.price === undefined || p.price === "" ? Infinity : Number(p.price));

/** As peças escolhidas, na ordem pedida: primeiro as que estão em `ordem` (as que não foram escolhidas somem), depois as outras na ordem em que vieram. */
export function pecasNaOrdem<P extends { id: number }>(escolhidas: P[], ordem: number[]): P[] {
  const porId = new Map(escolhidas.map((p) => [p.id, p]));
  const resultado: P[] = [];
  for (const id of ordem) {
    const p = porId.get(id);
    if (p) {
      resultado.push(p);
      porId.delete(id);
    }
  }
  for (const p of escolhidas) if (porId.has(p.id)) resultado.push(p);
  return resultado;
}

/** Ids das peças ordenados por um critério. O sorteio entra de fora para dar para testar. */
export function ordenarPor(pecas: PecaParaOrdenar[], criterio: CriterioDeOrdem, sorteio: () => number = Math.random): number[] {
  const lista = [...pecas];
  if (criterio === "aleatoria") {
    for (let i = lista.length - 1; i > 0; i--) {
      const j = Math.floor(sorteio() * (i + 1));
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    return lista.map((p) => p.id);
  }
  const porNome = (a: PecaParaOrdenar, b: PecaParaOrdenar) => comparar(a.name, b.name) || a.id - b.id;
  const regras: Record<Exclude<CriterioDeOrdem, "aleatoria">, (a: PecaParaOrdenar, b: PecaParaOrdenar) => number> = {
    "preco-menor": (a, b) => (preco(a) === preco(b) ? porNome(a, b) : preco(a) - preco(b)),
    "preco-maior": (a, b) => {
      // peça sem preço vai para o fim nos dois sentidos
      const pa = preco(a);
      const pb = preco(b);
      if (pa === pb) return porNome(a, b);
      if (pa === Infinity) return 1;
      if (pb === Infinity) return -1;
      return pb - pa;
    },
    nome: porNome,
    tipo: (a, b) => comparar(a.category, b.category) || porNome(a, b),
    fabricante: (a, b) => comparar(a.manufacturer_name, b.manufacturer_name) || porNome(a, b),
  };
  return lista.sort(regras[criterio]).map((p) => p.id);
}

/** Tira o id de onde está e coloca na posição `indice` da lista (0 = primeiro). Id que não está na lista deixa tudo como estava. */
export function moverPara(ids: number[], id: number, indice: number): number[] {
  const de = ids.indexOf(id);
  if (de === -1) return ids;
  const sem = ids.filter((x) => x !== id);
  const destino = Math.min(sem.length, Math.max(0, Math.trunc(indice)));
  return [...sem.slice(0, destino), id, ...sem.slice(destino)];
}

/** Sobe (-1) ou desce (+1) uma casa. */
export function moverUmaCasa(ids: number[], id: number, passo: -1 | 1): number[] {
  const de = ids.indexOf(id);
  if (de === -1) return ids;
  return moverPara(ids, id, de + passo);
}
