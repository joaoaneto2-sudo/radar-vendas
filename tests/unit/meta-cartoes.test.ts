import { describe, expect, it } from "vitest";
import { diasDeVendaAte, metaDosCartoes } from "../../lib/meta-cartoes";
import { montarRelatorioDoDia } from "../../lib/relatorio-do-dia";

const venda = (sale_date: string, sale_value: string, extra = {}) => ({
  sale_date, sale_value, price_tier: "varejo", status: "ativa", ...extra,
});

// Vendas de varejo de 01/11 a 11/11 somando R$ 5.000,00.
const vendas = [
  venda("2026-10-31", "900"), // antes do início: não conta
  venda("2026-11-03", "2000"),
  venda("2026-11-07", "1500"),
  venda("2026-11-11", "1500"),
  venda("2026-11-10", "800", { status: "cancelada" }),
  venda("2026-11-05", "7000", { price_tier: "atacado" }),
  venda("2026-11-12", "999"), // depois do dia do relatório: não conta
];

describe("meta dos cartões", () => {
  it("acumula só varejo ativo desde 01/11 até o dia", () => {
    const m = metaDosCartoes(vendas, "2026-11-11");
    expect(m.acumuladoCents).toBe(500000);
    expect(m.vendas).toBe(3);
  });

  it("Riachuelo: 10% guardado, falta e quanto vender até 13/11", () => {
    const r = metaDosCartoes(vendas, "2026-11-11").cartoes.find((c) => c.nome === "Riachuelo")!;
    expect(r.guardadoCents).toBe(50000); // 10% de 5.000
    expect(r.faltaGuardarCents).toBe(179000); // 2.290 - 500
    expect(r.precisaVenderCents).toBe(1790000); // 1.790 / 10%
    expect(r.diasDeVenda).toBe(1); // só quinta 12/11
    expect(r.precisaPorDiaCents).toBe(1790000);
    expect(r.quitado).toBe(false);
  });

  it("Santander: 90% guardado, falta e quanto vender até 02/12", () => {
    const s = metaDosCartoes(vendas, "2026-11-11").cartoes.find((c) => c.nome === "Santander")!;
    expect(s.guardadoCents).toBe(450000); // 90% de 5.000
    expect(s.faltaGuardarCents).toBe(700000); // 11.500 - 4.500
    expect(s.precisaVenderCents).toBe(777778); // 7.000 / 0,9 arredondado para cima
    // depois de 11/11 e antes de 02/12: 12-14, 17-21, 24-28 e terça 01/12 = 14 dias (ter a sáb)
    expect(s.diasDeVenda).toBe(14);
    expect(s.precisaPorDiaCents).toBe(55556);
  });

  it("cartão coberto e cartão vencido", () => {
    const muito = [venda("2026-11-03", "30000")];
    const r = metaDosCartoes(muito, "2026-11-11").cartoes[0];
    expect(r.quitado).toBe(true);
    expect(r.faltaGuardarCents).toBe(0);
    const depois = metaDosCartoes(vendas, "2026-11-14").cartoes[0];
    expect(depois.vencido).toBe(true);
  });

  it("dias de venda contam terça a sábado", () => {
    expect(diasDeVendaAte("2026-11-11", "2026-11-13")).toBe(1);
    expect(diasDeVendaAte("2026-11-14", "2026-11-17")).toBe(0); // domingo e segunda
  });

  it("aparece no relatório do dia", () => {
    const texto = montarRelatorioDoDia({
      dia: "2026-11-11",
      vendas,
      aReceber: [],
      meta: { hoje: "2026-11-11", partes: [], despesas: [], vendas, entradas: [] },
    });
    expect(texto).toContain("💳 *Meta dos cartões*");
    expect(texto).toContain("• Vendas desde 01/11: R$ 5.000,00 (3 vendas)");
    expect(texto).toContain("*Riachuelo* · R$ 2.290,00 · vence 13/11 · 10% de cada venda");
    expect(texto).toContain("• Guardado: R$ 500,00 (22%)");
    expect(texto).toContain("• Precisa vender: R$ 17.900,00");
    expect(texto).toContain("*Santander* · R$ 11.500,00 · vence 02/12 · 90% de cada venda");
    expect(texto).toContain("• Guardado: R$ 4.500,00 (39%)");
    expect(texto).toContain("• Precisa vender: R$ 7.777,78");
    expect(texto).toContain("• Por dia: R$ 555,56 nos 14 dias de venda até o vencimento");
  });
});
