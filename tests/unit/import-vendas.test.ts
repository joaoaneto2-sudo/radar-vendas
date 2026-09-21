import { describe, expect, it } from "vitest";
import { lerData, lerPlanilha, lerValor, limparNomeDoCliente } from "../../lib/import-vendas";

// A tabela do João, do jeito que o Excel copia (colunas separadas por tabulação).
const TABELA = [
  "DATA\tRECEITAS\tTIPO\tVALOR\tFORMA DE PAG",
  "ter 01/09\tVENDAS DE JOIAS E SEMI-JOIAS\tVARELO\t R$ 870,00 \t PIX Á VISTA ",
  "ter 01/09\tAPORTE JOÃO AMORIM\tAPORTE\t R$ 1.000,00 \t PIX Á VISTA ",
  "qua 02/09\tGIOVANA\tVARELO\t R$ 82,50 \t PIX Á VISTA ",
  "qui 03/09\tANDREIA PSICOLOGA\tVARELO\t R$ 374,00 \t PIX Á VISTA ",
  "sex 04/09\tRAQUEL\tVARELO\t R$ 500,00 \t PIX Á VISTA ",
  "sex 04/09\tPATRICIA ADV\tVARELO\t R$ 398,46 \t PIX Á VISTA ",
  "dom 06/09\tELIZABETE\tVARELO\t R$ 280,00 \t PIX Á VISTA ",
  "sex 11/09\tVENDA KIKA\tVARELO\t R$ 1.276,00 \t PIX Á VISTA ",
  "sex 11/09\tVENDA MICHELE\tVARELO\t R$ 2.507,00 \t PIX Á VISTA ",
].join("\n");

describe("leitura de data e valor", () => {
  it("data com dia da semana, com e sem ano", () => {
    expect(lerData("ter 01/09", 2026)).toBe("2026-09-01");
    expect(lerData("sex 11/09", 2026)).toBe("2026-09-11");
    expect(lerData("15/10/2025", 2026)).toBe("2025-10-15");
    expect(lerData("05/03/26", 2026)).toBe("2026-03-05");
  });

  it("data que não existe ou texto que não é data", () => {
    expect(lerData("31/02", 2026)).toBeNull();
    expect(lerData("abc", 2026)).toBeNull();
  });

  it("valor em reais do jeito brasileiro, em centavos", () => {
    expect(lerValor(" R$ 870,00 ")).toBe(87000);
    expect(lerValor("R$ 1.276,00")).toBe(127600);
    expect(lerValor("82,5")).toBe(8250);
    expect(lerValor("398,46")).toBe(39846);
    expect(lerValor("")).toBeNull();
    expect(lerValor("abc")).toBeNull();
  });
});

describe("nome do cliente", () => {
  it("tira o VENDA do começo e deixa em maiúscula só a primeira letra", () => {
    expect(limparNomeDoCliente("VENDA KIKA")).toEqual({ nome: "Kika", criarCliente: true });
    expect(limparNomeDoCliente("ANDREIA PSICOLOGA")).toEqual({ nome: "Andreia Psicologa", criarCliente: true });
    expect(limparNomeDoCliente("PATRICIA ADV")).toEqual({ nome: "Patricia ADV", criarCliente: true });
  });

  it("linha geral de várias vendas não vira cliente", () => {
    expect(limparNomeDoCliente("VENDAS DE JOIAS E SEMI-JOIAS")).toEqual({ nome: "Vendas de Joias e Semi-joias", criarCliente: false });
  });
});

describe("a tabela do João", () => {
  const itens = lerPlanilha(TABELA, 2026);

  it("lê as 9 linhas e pula o cabeçalho", () => {
    expect(itens).toHaveLength(9);
    expect(itens.filter((i) => i.tipo === "ignorada")).toEqual([]);
  });

  it("sete vendas de clientes, uma venda geral e um aporte", () => {
    const vendas = itens.filter((i) => i.tipo === "venda");
    expect(vendas).toHaveLength(8);
    expect(vendas.filter((v) => v.tipo === "venda" && v.criarCliente).map((v) => v.tipo === "venda" && v.cliente)).toEqual([
      "Giovana",
      "Andreia Psicologa",
      "Raquel",
      "Patricia ADV",
      "Elizabete",
      "Kika",
      "Michele",
    ]);
    const geral = vendas.find((v) => v.tipo === "venda" && !v.criarCliente);
    expect(geral).toMatchObject({ data: "2026-09-01", valorCents: 87000, formaDePagamento: "Pix à vista" });
  });

  it("o aporte é do João, de R$ 1.000, no dia 01/09", () => {
    expect(itens.find((i) => i.tipo === "aporte")).toMatchObject({ socio: "joao", valorCents: 100000, data: "2026-09-01" });
  });

  it("as datas e os valores batem com a planilha", () => {
    const resumo = itens.filter((i) => i.tipo === "venda").map((i) => (i.tipo === "venda" ? [i.data, i.valorCents] : []));
    expect(resumo).toEqual([
      ["2026-09-01", 87000],
      ["2026-09-02", 8250],
      ["2026-09-03", 37400],
      ["2026-09-04", 50000],
      ["2026-09-04", 39846],
      ["2026-09-06", 28000],
      ["2026-09-11", 127600],
      ["2026-09-11", 250700],
    ]);
    const total = itens.reduce((t, i) => t + (i.tipo === "venda" ? i.valorCents : 0), 0);
    expect(total).toBe(87000 + 8250 + 37400 + 50000 + 39846 + 28000 + 127600 + 250700);
  });
});

describe("o que é ignorado, com o motivo", () => {
  it("tipo que ainda não importa, forma de pagamento diferente, aporte sem sócio, data e valor ruins", () => {
    const texto = [
      "01/09\tCLIENTE A\tATACADO\t100,00\tPIX Á VISTA",
      "01/09\tCLIENTE B\tVARELO\t100,00\tCARTÃO DE CRÉDITO",
      "01/09\tAPORTE DE ALGUÉM\tAPORTE\t100,00\tPIX",
      "xx\tCLIENTE C\tVARELO\t100,00\tPIX Á VISTA",
      "01/09\tCLIENTE D\tVARELO\tabc\tPIX Á VISTA",
      "01/09\tCLIENTE E\tVARELO",
      "01/09\t\tVARELO\t100,00\tPIX Á VISTA",
    ].join("\n");
    const itens = lerPlanilha(texto, 2026);
    expect(itens.every((i) => i.tipo === "ignorada")).toBe(true);
    const motivos = itens.map((i) => (i.tipo === "ignorada" ? i.motivo : ""));
    expect(motivos[0]).toContain("Tipo");
    expect(motivos[1]).toContain("Forma de pagamento");
    expect(motivos[2]).toContain("sócio");
    expect(motivos[3]).toContain("Data");
    expect(motivos[4]).toContain("Valor");
    expect(motivos[5]).toContain("incompleta");
    expect(motivos[6]).toContain("nome");
  });

  it("aporte da Fernanda é reconhecido; aceita VAREJO escrito certo; linhas em branco são puladas", () => {
    const itens = lerPlanilha("\n05/09\tAPORTE FERNANDA\tAPORTE\t2.000,00\tPIX\n\n06/09\tLUCIA\tVAREJO\t50,00\tPix à vista\n", 2026);
    expect(itens).toHaveLength(2);
    expect(itens[0]).toMatchObject({ tipo: "aporte", socio: "fernanda", valorCents: 200000 });
    expect(itens[1]).toMatchObject({ tipo: "venda", cliente: "Lucia" });
  });

  it("texto vazio não dá nada", () => {
    expect(lerPlanilha("", 2026)).toEqual([]);
    expect(lerPlanilha("DATA\tRECEITAS\tTIPO\tVALOR\tFORMA DE PAG", 2026)).toEqual([]);
  });
});
