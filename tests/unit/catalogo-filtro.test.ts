import { describe, expect, it } from "vitest";
import { contarMarcacao, filtrarPecas, lerValor, SEM_FILTRO, sortearPecas, temFiltro } from "../../lib/catalogo-filtro";

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

describe("filtros novos: preço, estoque, foto, catálogo", () => {
  const lista = [
    { id: 1, name: "A", price: 59.9, stock_qty: 2, photo_url: "a.jpg", show_catalog: true },
    { id: 2, name: "B", price: "129,90".replace(",", "."), stock_qty: 0, photo_url: null, show_catalog: true },
    { id: 3, name: "C", price: 249, stock_qty: 1, photo_url: "c.jpg", show_catalog: false },
    { id: 4, name: "D", price: null, stock_qty: 1, photo_url: "d.jpg", show_catalog: true },
  ];
  const nenhuma = new Set<number>();
  const ids = (f: Partial<typeof SEM_FILTRO>) => filtrarPecas(lista, { ...SEM_FILTRO, ...f }, nenhuma).map((p) => p.id);

  it("faixa de preço: mínimo, máximo e os dois; aceita vírgula e deixa de fora peça sem preço", () => {
    expect(ids({ precoMin: "100" })).toEqual([2, 3]);
    expect(ids({ precoMax: "129,90" })).toEqual([1, 2]);
    expect(ids({ precoMin: "60", precoMax: "200" })).toEqual([2]);
  });

  it("valor inválido ou vazio não limita", () => {
    expect(ids({ precoMin: "abc", precoMax: "" })).toEqual([1, 2, 3, 4]);
  });

  it("só com estoque, só com foto e só as do catálogo", () => {
    expect(ids({ soComEstoque: true })).toEqual([1, 3, 4]);
    expect(ids({ soComFoto: true })).toEqual([1, 3, 4]);
    expect(ids({ soDoCatalogo: true })).toEqual([1, 2, 4]);
    expect(ids({ soComEstoque: true, soComFoto: true, soDoCatalogo: true })).toEqual([1, 4]);
  });
});

describe("lerValor e temFiltro", () => {
  it("lê valores no formato brasileiro", () => {
    expect(lerValor("89,90")).toBe(89.9);
    expect(lerValor("1.234,50")).toBe(1234.5);
    expect(lerValor("89.90")).toBe(89.9);
    expect(lerValor("")).toBeNull();
    expect(lerValor("-5")).toBeNull();
  });

  it("temFiltro enxerga cada filtro novo", () => {
    expect(temFiltro(SEM_FILTRO)).toBe(false);
    expect(temFiltro({ ...SEM_FILTRO, precoMax: "100" })).toBe(true);
    expect(temFiltro({ ...SEM_FILTRO, soComEstoque: true })).toBe(true);
    expect(temFiltro({ ...SEM_FILTRO, precoMin: "xx" })).toBe(false);
  });
});

describe("sortearPecas", () => {
  it("devolve a quantidade pedida, sem repetir, e não mexe na lista original", () => {
    const origem = [1, 2, 3, 4, 5, 6];
    const r = sortearPecas(origem, 3, () => 0.5);
    expect(r).toHaveLength(3);
    expect(new Set(r).size).toBe(3);
    expect(origem).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("pedindo mais do que existe, devolve todas; pedindo zero ou negativo, nenhuma", () => {
    expect(sortearPecas([1, 2], 10)).toHaveLength(2);
    expect(sortearPecas([1, 2], 0)).toEqual([]);
    expect(sortearPecas([1, 2], -3)).toEqual([]);
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
