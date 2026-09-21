import { describe, expect, it } from "vitest";
import { resumoDoAcordo } from "../../lib/acordo-resumo";

const normal = (t: string) => t.replace(/\u00a0/g, " ");

const BASE = {
  joaoSharePct: 50,
  initialStockCents: 1500000,
  partnershipStart: "2026-09-01",
  debt: { totalCents: 750000, paidDirectCents: 100000, abatedCents: 0, balanceCents: 650000, paidFraction: 100000 / 750000 },
};

describe("o acordo em palavras", () => {
  it("o caso de hoje: 50/50, estoque de 15 mil, dívida de 7.500, já pagou 1.000, faltam 6.500", () => {
    const r = resumoDoAcordo(BASE);
    expect(r.partilha).toBe("João 50% · Fernanda 50%");
    expect(r.parteDoJoao).toBe("metade do estoque inicial");
    expect(normal(r.estoque.valor)).toBe("R$ 15.000,00");
    expect(normal(r.divida.total)).toBe("R$ 7.500,00");
    expect(normal(r.divida.falta)).toBe("R$ 6.500,00");
    expect(r.divida.quitada).toBe(false);
    const texto = normal(r.frases.join(" "));
    expect(texto).toContain("dividido meio a meio");
    expect(texto).toContain("antes de 01/09/2026");
    expect(texto).toContain("comprou metade");
    expect(texto).toContain("Ele já pagou R$ 1.000,00 direto");
    expect(texto).toContain("faltam R$ 6.500,00");
  });

  it("depois de abater com as vendas, mostra quanto já foi abatido", () => {
    const r = resumoDoAcordo({ ...BASE, debt: { ...BASE.debt, abatedCents: 200000, balanceCents: 450000 } });
    expect(normal(r.frases[3])).toContain("já foram abatidos R$ 2.000,00 pelas vendas e faltam R$ 4.500,00");
  });

  it("dívida quitada", () => {
    const r = resumoDoAcordo({ ...BASE, debt: { totalCents: 750000, paidDirectCents: 100000, abatedCents: 650000, balanceCents: 0, paidFraction: 1 } });
    expect(r.divida.quitada).toBe(true);
    expect(r.frases[3]).toContain("quitada");
  });

  it("partes que não são meio a meio", () => {
    const r = resumoDoAcordo({ ...BASE, joaoSharePct: 40, debt: { ...BASE.debt, totalCents: 600000, balanceCents: 500000 } });
    expect(r.partilha).toBe("João 40% · Fernanda 60%");
    expect(r.parteDoJoao).toBe("40% do estoque inicial");
    expect(r.frases[0]).toContain("40% para o João e 60% para a Fernanda");
  });
});
