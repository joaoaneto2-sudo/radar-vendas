import { describe, expect, it } from "vitest";
import { montarQuadroDaVitrine, textoDaFalta, type PecaDoQuadro } from "../../lib/vitrine-quadro";

const completa = (id: number, nome: string, o: Partial<PecaDoQuadro> = {}): PecaDoQuadro => ({
  id,
  name: nome,
  sale_channel: "varejo",
  active: true,
  show_online: false,
  featured: false,
  stock_qty: 3,
  photo_url: "https://x/f.jpg",
  price: "100.00",
  public_description: "Texto para o cliente.",
  ...o,
});

const ids = (l: { id: number }[]) => l.map((p) => p.id);

describe("quadro da vitrine: em qual grupo cada peça cai", () => {
  it("completa e com estoque: no carrossel, no site ou pode entrar", () => {
    const q = montarQuadroDaVitrine([
      completa(1, "A carrossel", { show_online: true, featured: true }),
      completa(2, "B no site", { show_online: true }),
      completa(3, "C pode entrar"),
    ]);
    expect(ids(q.carrossel)).toEqual([1]);
    expect(ids(q.noSite)).toEqual([2]);
    expect(ids(q.podemEntrar)).toEqual([3]);
    expect(q.atencao).toEqual([]);
  });

  it("esgotada vai para atenção, mesmo já estando no site ou no carrossel", () => {
    const q = montarQuadroDaVitrine([
      completa(1, "Esgotada fora", { stock_qty: 0 }),
      completa(2, "Esgotada no site", { stock_qty: 0, show_online: true, featured: true }),
    ]);
    expect(q.atencao.map((c) => [c.peca.id, c.motivos, c.noSite])).toEqual([
      [1, ["Esgotada"], false],
      [2, ["Esgotada"], true],
    ]);
    expect(q.carrossel).toEqual([]);
    expect(q.podemEntrar).toEqual([]);
  });

  it("incompleta vai para atenção com o que falta, na mesma ordem das regras de publicar", () => {
    const q = montarQuadroDaVitrine([
      completa(1, "Sem texto", { public_description: null }),
      completa(2, "Sem foto e preço", { photo_url: null, price: null }),
    ]);
    expect(q.atencao.map((c) => [c.peca.id, c.motivos])).toEqual([
      [2, ["Faltam: foto principal, preço"]],
      [1, ["Falta: descrição"]],
    ]);
  });

  it("esgotada e incompleta ao mesmo tempo mostra os dois motivos", () => {
    const q = montarQuadroDaVitrine([completa(1, "Ambas", { stock_qty: 0, public_description: "" })]);
    expect(q.atencao[0].motivos).toEqual(["Esgotada", "Falta: descrição"]);
  });

  it("peça de atacado e peça inativa ficam de fora", () => {
    const q = montarQuadroDaVitrine([
      completa(1, "Bia", { sale_channel: "atacado", stock_qty: 0 }),
      completa(2, "Inativa", { active: false }),
    ]);
    expect(ids(q.carrossel).concat(ids(q.noSite), ids(q.podemEntrar), ids(q.atencao.map((c) => c.peca)))).toEqual([]);
  });

  it("dentro de cada grupo, ordem alfabética sem diferenciar acento", () => {
    const q = montarQuadroDaVitrine([completa(1, "Zircônia"), completa(2, "Anel"), completa(3, "Érica")]);
    expect(ids(q.podemEntrar)).toEqual([2, 3, 1]);
  });

  it("sem peças: tudo vazio", () => {
    expect(montarQuadroDaVitrine([])).toEqual({ carrossel: [], noSite: [], podemEntrar: [], atencao: [] });
  });

  it("marcada como carrossel mas fora do site não conta como carrossel", () => {
    const q = montarQuadroDaVitrine([completa(1, "X", { show_online: false, featured: true })]);
    expect(ids(q.podemEntrar)).toEqual([1]);
  });
});

describe("texto da falta", () => {
  it("singular e plural", () => {
    expect(textoDaFalta(["descrição"])).toBe("Falta: descrição");
    expect(textoDaFalta(["foto principal", "descrição"])).toBe("Faltam: foto principal, descrição");
  });
});
