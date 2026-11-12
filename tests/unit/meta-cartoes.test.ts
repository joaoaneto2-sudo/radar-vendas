import { describe, expect, it } from "vitest";
import { diasDeVendaAte, metaDosCartoes } from "../../lib/meta-cartoes";
import { montarRelatorioDoDia } from "../../lib/relatorio-do-dia";

const venda = (sale_date: string, sale_value: string, extra = {}) => ({
  sale_date, sale_value, price_tier: "varejo", status: "ativa", ...extra,
});

// Igual ao Radar em 11/11/2026: R$ 5.664,00 vendidos desde 01/11.
const vendas = [
  venda("2026-10-31", "900"),
  venda("2026-11-03", "3553"),
  venda("2026-11-11", "2111"),
  venda("2026-11-10", "800", { status: "cancelada" }),
  venda("2026-11-05", "7000", { price_tier: "atacado" }),
  venda("2026-11-12", "999"),
];

describe("meta dos cartões", () => {
  const m = metaDosCartoes(vendas, "2026-11-11");
  const [riachuelo, santander] = m.cartoes;

  it("acumula só varejo ativo desde 01/11 até o dia", () => {
    expect(m.acumuladoCents).toBe(566400);
    expect(m.vendas).toBe(2);
  });

  it("plano principal: Riachuelo 10%, conta a venda do dia 13 até as 20h", () => {
    expect(riachuelo.guardadoCents).toBe(56640);
    expect(riachuelo.faltaGuardarCents).toBe(172360);
    expect(riachuelo.precisaVenderCents).toBe(1723600);
    expect(riachuelo.diasDeVenda).toBe(2); // 12 e 13/11
    expect(riachuelo.precisaPorDiaCents).toBe(861800);
  });

  it("plano principal: Santander 90% até as 20h de 02/12", () => {
    expect(santander.guardadoCents).toBe(509760);
    expect(santander.faltaGuardarCents).toBe(640240);
    expect(santander.precisaVenderCents).toBe(711378);
    expect(santander.diasDeVenda).toBe(15); // 12-14, 17-21, 24-28/11, 01 e 02/12
    expect(santander.precisaPorDiaCents).toBe(47426);
  });

  it("sugestão: pagar a Riachuelo inteira com o caixa e vender o resto até 02/12", () => {
    expect(m.sugestao).not.toBeNull();
    expect(m.sugestao!.primeiroCoberto).toBe(true);
    expect(m.sugestao!.sobraDepoisDoPrimeiroCents).toBe(337400);
    expect(m.sugestao!.precisaVenderCents).toBe(812600); // 2.290 + 11.500 - 5.664
    expect(m.sugestao!.diasDeVenda).toBe(15);
    expect(m.sugestao!.precisaPorDiaCents).toBe(54174);
  });

  it("a sugestão some depois que a Riachuelo vence", () => {
    expect(metaDosCartoes(vendas, "2026-11-14").sugestao).toBeNull();
  });

  it("dias de venda contam o vencimento", () => {
    expect(diasDeVendaAte("2026-11-13", "2026-11-13")).toBe(0);
    expect(diasDeVendaAte("2026-11-11", "2026-11-13")).toBe(2);
  });

  it("aparece no relatório do dia", () => {
    const texto = montarRelatorioDoDia({
      dia: "2026-11-11",
      vendas,
      aReceber: [],
      meta: { hoje: "2026-11-11", partes: [], despesas: [], vendas, entradas: [] },
    });
    expect(texto).toContain("*Riachuelo* · R$ 2.290,00 · vence 13/11 até as 20h · 10% de cada venda");
    expect(texto).toContain("• Meta: vender R$ 17.236,00 · R$ 8.618,00 por dia nos 2 dias de venda");
    expect(texto).toContain("*Santander* · R$ 11.500,00 · vence 02/12 até as 20h · 90% de cada venda");
    expect(texto).toContain("• Meta: vender R$ 7.113,78 · R$ 474,26 por dia nos 15 dias de venda");
    expect(texto).toContain("💡 *Sugestão para não pagar juros*");
    expect(texto).toContain("• Pagar a Riachuelo inteira com o caixa (sobram R$ 3.374,00)");
    expect(texto).toContain("• Meta: vender R$ 8.126,00 até 02/12 · R$ 541,74 por dia nos 15 dias de venda");
  });
});
