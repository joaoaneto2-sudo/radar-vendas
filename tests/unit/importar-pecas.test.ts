import { describe, expect, it } from "vitest";
import { lerNomeDoArquivo } from "../../lib/importar-pecas";

describe("lerNomeDoArquivo: nome e custo a partir do nome do arquivo da foto", () => {
  it("lê nome e custo com vírgula (exemplo real)", () => {
    expect(lerNomeDoArquivo("01 - Anel Cristal Transparente - custo 173,75.jpeg")).toEqual({
      nome: "Anel Cristal Transparente",
      custoCentavos: 17375,
    });
  });

  it("lê nome e custo quando o prefixo tem traços sem espaço (não conta como separador)", () => {
    expect(
      lerNomeDoArquivo("NOVO-AN-001 - Aliança 15 inteira em pedra de moissanite 4mm - custo 489,00.jpeg")
    ).toEqual({
      nome: "Aliança 15 inteira em pedra de moissanite 4mm",
      custoCentavos: 48900,
    });
  });

  it("nome com mais de um traço no meio: junta de volta com ' - '", () => {
    expect(lerNomeDoArquivo("02 - Colar - Prata 925 - custo 250,00.jpeg")).toEqual({
      nome: "Colar - Prata 925",
      custoCentavos: 25000,
    });
  });

  it("custo com separador de milhar (ponto)", () => {
    expect(lerNomeDoArquivo("03 - Pulseira Riviera Cravejada - custo 1.222,50.jpeg")).toEqual({
      nome: "Pulseira Riviera Cravejada",
      custoCentavos: 122250,
    });
  });

  it("custo sem casas decimais", () => {
    expect(lerNomeDoArquivo("04 - Brinco Argola - custo 90.jpeg")).toEqual({
      nome: "Brinco Argola",
      custoCentavos: 9000,
    });
  });

  it("funciona com outras extensões de imagem", () => {
    expect(lerNomeDoArquivo("05 - Anel Solitário - custo 300,00.png")).toEqual({
      nome: "Anel Solitário",
      custoCentavos: 30000,
    });
  });

  it("arquivo fora do padrão: sem a palavra custo devolve null", () => {
    expect(lerNomeDoArquivo("01 - Anel Cristal Transparente - preço 173,75.jpeg")).toBeNull();
  });

  it("arquivo fora do padrão: menos de 2 traços devolve null", () => {
    expect(lerNomeDoArquivo("Anel Cristal Transparente.jpeg")).toBeNull();
    expect(lerNomeDoArquivo("01 - Anel Cristal Transparente.jpeg")).toBeNull();
  });

  it("arquivo fora do padrão: nome vazio entre os traços devolve null", () => {
    expect(lerNomeDoArquivo("01 -  - custo 100,00.jpeg")).toBeNull();
  });

  it("arquivo fora do padrão: custo zero ou inválido devolve null", () => {
    expect(lerNomeDoArquivo("01 - Anel - custo 0,00.jpeg")).toBeNull();
  });
});
