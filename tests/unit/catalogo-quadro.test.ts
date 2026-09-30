import { describe, expect, it } from "vitest";
import { montarQuadroDoCatalogo, pecaProntaParaCatalogo, type PecaDoCatalogo } from "../../lib/catalogo-quadro";

const completa = (id: number, nome: string, o: Partial<PecaDoCatalogo> = {}): PecaDoCatalogo => ({
  id,
  name: nome,
  sale_channel: "varejo",
  active: true,
  show_catalog: false,
  photo_url: "https://x/f.jpg",
  price: "100.00",
  ...o,
});

const ids = (l: { id: number }[]) => l.map((p) => p.id);

describe("pronta para o catálogo: só foto e preço (sem exigir descrição nem estoque)", () => {
  it("com foto e preço maior que zero, está pronta", () => {
    expect(pecaProntaParaCatalogo({ photo_url: "https://x/a.jpg", price: 100 })).toBe(true);
  });

  it("sem foto, ou sem preço, ou preço zero, não está pronta", () => {
    expect(pecaProntaParaCatalogo({ photo_url: null, price: 100 })).toBe(false);
    expect(pecaProntaParaCatalogo({ photo_url: "https://x/a.jpg", price: null })).toBe(false);
    expect(pecaProntaParaCatalogo({ photo_url: "https://x/a.jpg", price: 0 })).toBe(false);
    expect(pecaProntaParaCatalogo({ photo_url: "https://x/a.jpg", price: "" })).toBe(false);
  });

  it("peça sob encomenda com estoque zero ainda pode estar pronta (o catálogo não olha estoque)", () => {
    expect(pecaProntaParaCatalogo({ photo_url: "https://x/a.jpg", price: 100 })).toBe(true);
  });
});

describe("quadro do catálogo: em qual grupo cada peça cai", () => {
  it("no catálogo, ou pronta para entrar", () => {
    const q = montarQuadroDoCatalogo([
      completa(1, "A no catálogo", { show_catalog: true }),
      completa(2, "B pronta"),
    ]);
    expect(ids(q.noCatalogo)).toEqual([1]);
    expect(ids(q.podemEntrar)).toEqual([2]);
  });

  it("incompleta (sem foto ou preço) não aparece em nenhum grupo", () => {
    const q = montarQuadroDoCatalogo([completa(1, "Sem foto", { photo_url: null }), completa(2, "Sem preço", { price: null })]);
    expect(q.noCatalogo).toEqual([]);
    expect(q.podemEntrar).toEqual([]);
  });

  it("peça de atacado e peça inativa ficam de fora, mesmo já marcadas no catálogo", () => {
    const q = montarQuadroDoCatalogo([
      completa(1, "Bia", { sale_channel: "atacado", show_catalog: true }),
      completa(2, "Inativa", { active: false, show_catalog: true }),
    ]);
    expect(ids(q.noCatalogo).concat(ids(q.podemEntrar))).toEqual([]);
  });

  it("dentro de cada grupo, ordem alfabética sem diferenciar acento", () => {
    const q = montarQuadroDoCatalogo([completa(1, "Zircônia"), completa(2, "Anel"), completa(3, "Érica")]);
    expect(ids(q.podemEntrar)).toEqual([2, 3, 1]);
  });

  it("sem peças: tudo vazio", () => {
    expect(montarQuadroDoCatalogo([])).toEqual({ noCatalogo: [], podemEntrar: [] });
  });
});
