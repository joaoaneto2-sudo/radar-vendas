import { describe, expect, it } from "vitest";
import { centsToDecimalString, formatCentsBRL, pctOf, roundDiv, toCents } from "../../lib/finance/money";

describe("toCents (reais para centavos)", () => {
  it("converte textos do banco sem erro de decimal", () => {
    expect(toCents("398.46")).toBe(39846);
    expect(toCents("82.50")).toBe(8250);
    expect(toCents("82.5")).toBe(8250);
    expect(toCents("1000")).toBe(100000);
    expect(toCents("0.05")).toBe(5);
  });

  it("aceita vírgula", () => {
    expect(toCents("398,46")).toBe(39846);
  });

  it("vazio, nulo e indefinido viram zero", () => {
    expect(toCents("")).toBe(0);
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
  });

  it("aceita número e evita o erro clássico do 0,1 + 0,2", () => {
    expect(toCents(82.5)).toBe(8250);
    expect(toCents(398.46)).toBe(39846);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("aceita valor negativo", () => {
    expect(toCents("-10.50")).toBe(-1050);
  });

  it("arredonda a terceira casa (meio para cima)", () => {
    expect(toCents("1.005")).toBe(101);
    expect(toCents("1.004")).toBe(100);
  });

  it("recusa texto que não é dinheiro", () => {
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents("12.3.4")).toThrow();
    expect(() => toCents(Number.NaN)).toThrow();
  });
});

describe("roundDiv (divisão arredondada)", () => {
  it("arredonda meio para longe do zero", () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(-5, 2)).toBe(-3);
    expect(roundDiv(7, 3)).toBe(2);
    expect(roundDiv(4, 3)).toBe(1);
    expect(roundDiv(0, 5)).toBe(0);
  });

  it("recusa denominador zero ou negativo", () => {
    expect(() => roundDiv(1, 0)).toThrow();
    expect(() => roundDiv(1, -2)).toThrow();
  });
});

describe("pctOf (percentual de um valor)", () => {
  it("30% de R$ 590,00 dá R$ 177,00", () => {
    expect(pctOf(59000, 30)).toBe(17700);
  });

  it("30% de R$ 398,46 dá R$ 119,54 (119,538 arredondado)", () => {
    expect(pctOf(39846, 30)).toBe(11954);
  });

  it("aceita percentual com casas e zero", () => {
    expect(pctOf(10000, 33.33)).toBe(3333);
    expect(pctOf(10000, 0)).toBe(0);
  });
});

describe("formatação", () => {
  it("centavos para texto do banco", () => {
    expect(centsToDecimalString(123456)).toBe("1234.56");
    expect(centsToDecimalString(5)).toBe("0.05");
    expect(centsToDecimalString(-1050)).toBe("-10.50");
    expect(centsToDecimalString(0)).toBe("0.00");
  });

  it("centavos para R$", () => {
    const texto = formatCentsBRL(123456).replace(/\s/g, " ");
    expect(texto).toBe("R$ 1.234,56");
  });
});
