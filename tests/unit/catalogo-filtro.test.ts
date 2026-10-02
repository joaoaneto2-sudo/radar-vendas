import { describe, expect, it } from "vitest";
import { contarMarcacao, filtrarPecas, SEM_FILTRO } from "../../lib/catalogo-filtro";

const pecas = [
  { id: 1, name: "Brinco em ródio com zircônias", category: "Brincos", manufacturer_name: "Zarpellon" },
  { id: 2, name: "Brinco pérola Shell", category: "Brincos", manufacturer_name: "Zarpellon" },
  { id: 3, name: "Brinco argola com Zircônia", category: "Brincos", manufacturer_name: "Luciana Rangel" },
  { id: 4, name: "Colar em zirconias", category: "Colares e Correntes", manufacturer_name: "Zarpellon" },
  { id: 5, name: "Pulseira em elos", category: "Pulseiras", manufacturer_name: null },
];
const todas = new Set([1, 2, 3, 4, 5]);

describe("filtrarPecas", () => {
  it("sem filtro devolve tudo", () => {
    expect(filtrarPecas(pecas, SEM_FILTRO, todas)).toHaveLength(5);
  });

  it("filtra por uma ou mais categorias", () => {
    expect(filtrarPecas(pecas, { ...SEM_FILTRO, categorias: ["Brincos"] }, todas)).toHaveLength(3);
    expect(filtrarPecas(pecas, { ...SEM_FILTRO, categorias: ["Brincos", "Pulseiras"] }, todas)).toHaveLength(4);
  });

  it("brincos da Zarpellon: categoria e fabricante juntos", () => {
    const r = filtrarPecas(pecas, { ...SEM_FILTRO, categorias: ["Brincos"], fabricante: "Zarpellon" }, todas);
    expect(r.map((p) => p.id)).toEqual([1, 2]);
  });

  it("busca no nome ignora acento e maiúscula (zirconia acha zircônias)", () => {
    const r = filtrarPecas(pecas, { ...SEM_FILTRO, busca: "ZIRCONIA" }, todas);
    expect(r.map((p) => p.id)).toEqual([1, 3, 4]);
  });

  it("peça sem fabricante some quando se escolhe um fabricante", () => {
    expect(filtrarPecas(pecas, { ...SEM_FILTRO, fabricante: "Zarpellon" }, todas)).toHaveLength(3);
  });

  it("situação: só marcadas e só desmarcadas respeitam a seleção atual", () => {
    const marcadas = new Set([1, 4]);
    expect(filtrarPecas(pecas, { ...SEM_FILTRO, situacao: "marcadas" }, marcadas).map((p) => p.id)).toEqual([1, 4]);
    expect(filtrarPecas(pecas, { ...SEM_FILTRO, situacao: "desmarcadas" }, marcadas).map((p) => p.id)).toEqual([2, 3, 5]);
  });

  it("ignorar 'categorias' conta cada tipo sem o filtro de tipo, mas mantém os outros", () => {
    const f = { ...SEM_FILTRO, categorias: ["Pulseiras"], fabricante: "Zarpellon" };
    expect(filtrarPecas(pecas, f, todas, "categorias").map((p) => p.id)).toEqual([1, 2, 4]);
  });
});

describe("contarMarcacao", () => {
  it("conta o total e quantas estão marcadas, em ordem alfabética, ignorando vazios", () => {
    const r = contarMarcacao(pecas, (p) => p.category, new Set([1, 2, 5]));
    expect(r).toEqual([
      { nome: "Brincos", total: 3, marcadas: 2 },
      { nome: "Colares e Correntes", total: 1, marcadas: 0 },
      { nome: "Pulseiras", total: 1, marcadas: 1 },
    ]);
    expect(contarMarcacao(pecas, (p) => p.manufacturer_name, new Set())).toHaveLength(2);
  });
});
