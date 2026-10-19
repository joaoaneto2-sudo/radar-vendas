import { describe, expect, it } from "vitest";
import { validarCorrecao } from "../../lib/corrigir-peca";

describe("validarCorrecao", () => {
  it("custo aceita vírgula e, com calcularPreco, refaz o preço (custo x 2,5)", () => {
    expect(validarCorrecao({ custo: "77,00", calcularPreco: true })).toEqual({ ok: true, correcao: { cost: 77, price: 192.5 } });
    expect(validarCorrecao({ custo: 49 })).toEqual({ ok: true, correcao: { cost: 49 } });
  });

  it("preço de venda e código", () => {
    expect(validarCorrecao({ preco: "122,50" })).toEqual({ ok: true, correcao: { price: 122.5 } });
    expect(validarCorrecao({ codigo: " BRILHARE-BR-005 " })).toEqual({ ok: true, correcao: { manufacturer_code: "BRILHARE-BR-005" } });
  });

  it("recusa valor zero, negativo, texto, código fora do formato e pedido vazio", () => {
    expect(validarCorrecao({ custo: 0 }).ok).toBe(false);
    expect(validarCorrecao({ custo: "-5" }).ok).toBe(false);
    expect(validarCorrecao({ custo: "abc" }).ok).toBe(false);
    expect(validarCorrecao({ preco: "" }).ok).toBe(false);
    expect(validarCorrecao({ codigo: "xyz" }).ok).toBe(false);
    expect(validarCorrecao({}).ok).toBe(false);
    expect(validarCorrecao(null).ok).toBe(false);
  });
});
