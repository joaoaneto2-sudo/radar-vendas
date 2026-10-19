import { describe, expect, it } from "vitest";
import { faltaCusto } from "../../lib/custo";

describe("faltaCusto", () => {
  it("custo vazio, zero ou inválido em peça nossa é falta", () => {
    expect(faltaCusto({ cost: null })).toBe(true);
    expect(faltaCusto({})).toBe(true);
    expect(faltaCusto({ cost: "" })).toBe(true);
    expect(faltaCusto({ cost: 0 })).toBe(true);
    expect(faltaCusto({ cost: "0.00", sale_channel: "varejo" })).toBe(true);
    expect(faltaCusto({ cost: "abc" })).toBe(true);
  });

  it("custo preenchido não é falta", () => {
    expect(faltaCusto({ cost: 77 })).toBe(false);
    expect(faltaCusto({ cost: "49.00", sale_channel: "varejo" })).toBe(false);
  });

  it("peça de atacado (do fabricante) nunca é falta de custo", () => {
    expect(faltaCusto({ cost: null, sale_channel: "atacado" })).toBe(false);
  });
});
