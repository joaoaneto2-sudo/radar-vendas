import { describe, expect, it } from "vitest";
import { moverPara, moverUmaCasa, ordenarPor, pecasNaOrdem } from "../../lib/catalogo-ordem";

const pecas = [
  { id: 1, name: "Colar longo", category: "Colares e Correntes", price: 297.5, manufacturer_name: "Zarpellon" },
  { id: 2, name: "Anel duplo", category: "Anéis", price: 172.5, manufacturer_name: "Escolhas de Fernanda" },
  { id: 3, name: "Brinco ear cuf", category: "Brincos", price: 450, manufacturer_name: "Nino" },
  { id: 4, name: "Brinco ródio", category: "Brincos", price: "147.50", manufacturer_name: "Zarpellon" },
  { id: 5, name: "Peça sem preço", category: "Outros", price: null, manufacturer_name: null },
];

describe("pecasNaOrdem", () => {
  it("segue a ordem pedida, põe no fim quem não está nela e ignora ids que não foram escolhidos", () => {
    const escolhidas = pecas.slice(0, 4);
    expect(pecasNaOrdem(escolhidas, [3, 1, 99]).map((p) => p.id)).toEqual([3, 1, 2, 4]);
  });
  it("sem ordem nenhuma, mantém a ordem da lista", () => {
    expect(pecasNaOrdem(pecas, []).map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("ordenarPor", () => {
  it("preço do menor ao maior, sem preço por último", () => {
    expect(ordenarPor(pecas, "preco-menor")).toEqual([4, 2, 1, 3, 5]);
  });
  it("preço do maior ao menor, sem preço por último", () => {
    expect(ordenarPor(pecas, "preco-maior")).toEqual([3, 1, 2, 4, 5]);
  });
  it("nome de A a Z, ignorando acento e maiúscula", () => {
    expect(ordenarPor(pecas, "nome")).toEqual([2, 3, 4, 1, 5]);
  });
  it("por tipo e depois por nome", () => {
    expect(ordenarPor(pecas, "tipo")).toEqual([2, 3, 4, 1, 5]);
  });
  it("por fabricante: sem fabricante primeiro, depois em ordem alfabética", () => {
    expect(ordenarPor(pecas, "fabricante")).toEqual([5, 2, 3, 4, 1]);
  });
  it("embaralhar devolve as mesmas peças e não mexe na lista original", () => {
    const original = pecas.map((p) => p.id);
    const r = ordenarPor(pecas, "aleatoria", () => 0.3);
    expect([...r].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(pecas.map((p) => p.id)).toEqual(original);
  });
});

describe("moverPara e moverUmaCasa", () => {
  it("leva uma peça para o começo, para o fim e para uma posição", () => {
    expect(moverPara([1, 2, 3, 4], 3, 0)).toEqual([3, 1, 2, 4]);
    expect(moverPara([1, 2, 3, 4], 1, 99)).toEqual([2, 3, 4, 1]);
    expect(moverPara([1, 2, 3, 4], 4, 1)).toEqual([1, 4, 2, 3]);
  });
  it("id que não está na lista deixa tudo como está", () => {
    const lista = [1, 2, 3];
    expect(moverPara(lista, 9, 0)).toBe(lista);
    expect(moverUmaCasa(lista, 9, 1)).toBe(lista);
  });
  it("sobe e desce uma casa, sem passar das pontas", () => {
    expect(moverUmaCasa([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(moverUmaCasa([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    expect(moverUmaCasa([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(moverUmaCasa([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
  });
});
