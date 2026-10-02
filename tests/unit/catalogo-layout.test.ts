import { describe, expect, it } from "vitest";
import { CAPAS, decidirPagina, enquadramento, precoDaLegenda } from "../../lib/catalogo-layout";

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
