import { describe, expect, it } from "vitest";
import { agruparPorPagina, CAPAS, DESENHOS_DA_PAGINA, desenhoDaPagina, decidirPagina, enquadramento, gradeDaPagina, porPaginaValido, precoDaLegenda } from "../../lib/catalogo-layout";

describe("decidirPagina", () => {
  it("sem classificação, trata como foto limpa", () => {
    expect(decidirPagina({})).toBe("limpa-unica");
    expect(decidirPagina({ catalog_photo: null })).toBe("limpa-unica");
  });

  it("foto limpa sozinha vira página única", () => {
    expect(decidirPagina({ catalog_photo: { kind: "limpa", fx: 50, fy: 50, zoom: 1 } })).toBe("limpa-unica");
  });

  it("foto com a modelo vira página dupla com recorte", () => {
    expect(decidirPagina({ catalog_photo: { kind: "modelo", fx: 40, fy: 60, zoom: 2 } })).toBe("duplo-modelo");
  });

  it("foto limpa mais foto da modelo vira página dupla de duas fotos", () => {
    expect(decidirPagina({ catalog_photo: null, photo_modelo_url: "https://x/m.jpg" })).toBe("duplo-limpa");
  });

  it("se a foto principal já é da modelo, o recorte vale mais que a segunda foto", () => {
    expect(
      decidirPagina({ catalog_photo: { kind: "modelo", fx: 50, fy: 50, zoom: 1 }, photo_modelo_url: "https://x/m.jpg" })
    ).toBe("duplo-modelo");
  });
});

describe("enquadramento", () => {
  it("sem foto classificada, centraliza sem zoom", () => {
    expect(enquadramento(null)).toEqual({ fx: 50, fy: 50, zoom: 1 });
  });

  it("mantém valores válidos e corrige os fora do limite", () => {
    expect(enquadramento({ kind: "modelo", fx: 30, fy: 70, zoom: 2 })).toEqual({ fx: 30, fy: 70, zoom: 2 });
    expect(enquadramento({ kind: "modelo", fx: -5, fy: 140, zoom: 9 })).toEqual({ fx: 0, fy: 100, zoom: 3 });
    expect(enquadramento({ kind: "modelo", fx: 50, fy: 50, zoom: 0.2 }).zoom).toBe(1);
  });
});

describe("precoDaLegenda", () => {
  it("formata como R$ 129,90", () => {
    expect(precoDaLegenda(129.9).replace(/\s/g, " ")).toBe("R$ 129,90");
    expect(precoDaLegenda("129.90").replace(/\s/g, " ")).toBe("R$ 129,90");
  });

  it("peça sem preço não mostra nada", () => {
    expect(precoDaLegenda(null)).toBe("");
    expect(precoDaLegenda(undefined)).toBe("");
  });
});

describe("CAPAS", () => {
  it("tem as três capas na ordem", () => {
    expect(CAPAS).toEqual(["/catalogo/capas/capa-1.jpg", "/catalogo/capas/capa-2.jpg", "/catalogo/capas/capa-3.jpg"]);
  });
});

describe("peças por página", () => {
  it("aceita de 1 a 10 e volta ao padrão (1) para qualquer outra coisa", () => {
    for (let n = 1; n <= 10; n++) expect(porPaginaValido(n)).toBe(n);
    for (const ruim of [0, 11, -1, 2.5, "4", null, undefined]) expect(porPaginaValido(ruim)).toBe(1);
  });

  it("agrupa em páginas, a última pode ficar com menos", () => {
    expect(agruparPorPagina([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(agruparPorPagina([], 4)).toEqual([]);
  });

  it("toda grade comporta as peças, cada mini-spread cabe na área útil e as letras ficam entre 1x e 3x", () => {
    for (let n = 2; n <= 10; n++) {
      const g = gradeDaPagina(n);
      const altura = g.largura / (297 / 210);
      expect(g.colunas * g.linhas).toBeGreaterThanOrEqual(n);
      expect(g.colunas * g.largura + (g.colunas - 1) * 2.5).toBeLessThanOrEqual(90.01);
      expect(g.linhas * altura + (g.linhas - 1) * 2.5).toBeLessThanOrEqual(57.71);
      expect(g.texto).toBeGreaterThanOrEqual(1);
      expect(g.texto).toBeLessThanOrEqual(3);
    }
  });

  it("2 por página são 2 colunas e 4 por página são 2 x 2; mais peças deixam cada spread menor e as letras maiores", () => {
    expect(gradeDaPagina(2)).toMatchObject({ colunas: 2, linhas: 1 });
    expect(gradeDaPagina(4)).toMatchObject({ colunas: 2, linhas: 2 });
    expect(gradeDaPagina(2).largura).toBeGreaterThan(gradeDaPagina(6).largura);
    expect(gradeDaPagina(6).largura).toBeGreaterThan(gradeDaPagina(10).largura);
    expect(gradeDaPagina(10).texto).toBeGreaterThan(gradeDaPagina(2).texto);
  });
});

describe("desenho de cada página", () => {
  it("sem variar, todas usam o desenho 0", () => {
    for (let i = 0; i < 8; i++) expect(desenhoDaPagina(i, false)).toBe(0);
  });

  it("variando, páginas vizinhas nunca repetem e os 5 desenhos aparecem em cada rodada", () => {
    const seq = Array.from({ length: 12 }, (_, i) => desenhoDaPagina(i, true));
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    expect(new Set(seq.slice(0, DESENHOS_DA_PAGINA)).size).toBe(DESENHOS_DA_PAGINA);
    expect(seq.slice(5, 10)).toEqual(seq.slice(0, 5));
  });

  it("índice negativo ou quebrado não estraga", () => {
    expect(desenhoDaPagina(-1, true)).toBeGreaterThanOrEqual(0);
    expect(desenhoDaPagina(2.7, true)).toBe(desenhoDaPagina(2, true));
  });
});
