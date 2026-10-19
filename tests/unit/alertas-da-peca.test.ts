import { describe, expect, it } from "vitest";
import { alertasDaPeca, contarAlertas } from "../../lib/alertas-da-peca";

const completa = {
  cost: 77,
  price: 192.5,
  sale_channel: "varejo",
  photo_url: "/estoque/x/close.jpg",
  modelo_photo_url: "/estoque/x/modelo.jpg",
  catalog_photo: { kind: "limpa" as const },
  manufacturer_code: "BRILHARE-BR-001",
};

describe("alertasDaPeca", () => {
  it("peça completa não tem alerta", () => {
    expect(alertasDaPeca(completa)).toEqual([]);
  });

  it("cada dado que falta vira o seu alerta, na ordem", () => {
    expect(alertasDaPeca({ ...completa, cost: null })).toEqual(["custo"]);
    expect(alertasDaPeca({ ...completa, price: null })).toEqual(["preco"]);
    expect(alertasDaPeca({ ...completa, photo_url: null })).toEqual(["foto"]);
    expect(alertasDaPeca({ ...completa, modelo_photo_url: null })).toEqual(["modelo"]);
    expect(alertasDaPeca({ ...completa, manufacturer_code: null })).toEqual(["codigo"]);
    expect(alertasDaPeca({ cost: null, price: 0, sale_channel: "varejo" })).toEqual(["custo", "preco", "foto", "codigo"]);
  });

  it("sem foto principal não avisa de foto da modelo ao mesmo tempo", () => {
    expect(alertasDaPeca({ ...completa, photo_url: "", modelo_photo_url: null })).toEqual(["foto"]);
  });

  it("peça cuja foto única é da modelo não precisa de foto da modelo", () => {
    expect(alertasDaPeca({ ...completa, modelo_photo_url: null, catalog_photo: { kind: "modelo" } })).toEqual([]);
  });

  it("código provisório (NOVO-, SEMFORN-) ainda é alerta de código", () => {
    expect(alertasDaPeca({ ...completa, manufacturer_code: "NOVO-CO-005" })).toEqual(["codigo"]);
    expect(alertasDaPeca({ ...completa, manufacturer_code: "SEMFORN-BR-002" })).toEqual(["codigo"]);
  });

  it("peça de atacado só tem alerta de preço de venda e foto", () => {
    expect(alertasDaPeca({ sale_channel: "atacado", price: 100, photo_url: "x.jpg" })).toEqual([]);
    expect(alertasDaPeca({ sale_channel: "atacado", price: null, photo_url: null })).toEqual(["preco", "foto"]);
  });
});

describe("contarAlertas", () => {
  it("conta quantas peças têm cada alerta", () => {
    const r = contarAlertas([completa, { ...completa, cost: null }, { ...completa, cost: null, manufacturer_code: null }]);
    expect(r).toEqual({ custo: 2, preco: 0, foto: 0, modelo: 0, codigo: 1 });
  });
});
