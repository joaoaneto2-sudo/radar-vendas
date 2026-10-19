import { describe, expect, it } from "vitest";
import { FORMATO_DO_CODIGO, ehProvisorio, proximoCodigo, siglaDoNome, tipoDaCategoria } from "../../lib/codigo-da-peca";

describe("proximoCodigo", () => {
  const pecas = [
    { manufacturer_code: "GLAMOUR-BR-001" },
    { manufacturer_code: "GLAMOUR-BR-002" },
    { manufacturer_code: "GLAMOUR-CO-001" },
    { manufacturer_code: "NOVO-CO-004" },
    { manufacturer_code: null },
  ];

  it("dá o próximo número do tipo, usando a sigla que o fabricante já tem", () => {
    expect(proximoCodigo(pecas, "Glamour", "Brincos")).toBe("GLAMOUR-BR-003");
    expect(proximoCodigo(pecas, "Glamour", "Colares e Correntes")).toBe("GLAMOUR-CO-002");
    expect(proximoCodigo(pecas, "Glamour", "Pulseiras")).toBe("GLAMOUR-PU-001");
  });

  it("código provisório não conta como número usado nem como sigla", () => {
    expect(proximoCodigo([{ manufacturer_code: "NOVO-CO-001" }], "Renata", "Colares e Correntes")).toBe("RENATA-CO-001");
  });

  it("pula buraco só se o número está ocupado (pega o primeiro livre)", () => {
    expect(proximoCodigo([{ manufacturer_code: "MAX-BR-001" }, { manufacturer_code: "MAX-BR-003" }], "Max", "Brincos")).toBe("MAX-BR-002");
  });

  it("sem nenhum código, a sigla vem do nome (sem acento, até 8 letras)", () => {
    expect(proximoCodigo([], "Catharina Degam", "Colares e Correntes")).toBe("CATHARIN-CO-001");
    expect(siglaDoNome("Simone Jóias")).toBe("SIMONEJO");
  });

  it("categoria desconhecida vira OU", () => {
    expect(tipoDaCategoria("Coisas")).toBe("OU");
    expect(tipoDaCategoria(null)).toBe("OU");
  });
});

describe("formato e provisório", () => {
  it("aceita o formato SIGLA-TIPO-NNN, inclusive com acento na sigla", () => {
    expect(FORMATO_DO_CODIGO.test("BRILHARE-BR-005")).toBe(true);
    expect(FORMATO_DO_CODIGO.test("SIMONEJÓ-BR-001")).toBe(true);
    expect(FORMATO_DO_CODIGO.test("abc")).toBe(false);
    expect(FORMATO_DO_CODIGO.test("MAX-XX-001")).toBe(false);
  });

  it("NOVO- e SEMFORN- são provisórios", () => {
    expect(ehProvisorio("NOVO-AN-004")).toBe(true);
    expect(ehProvisorio("SEMFORN-BR-001")).toBe(true);
    expect(ehProvisorio("MAX-BR-001")).toBe(false);
    expect(ehProvisorio(null)).toBe(false);
  });
});
