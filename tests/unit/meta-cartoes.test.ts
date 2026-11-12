import { describe, expect, it } from "vitest";
import { diasDeVendaAte, metaDosCartoes } from "../../lib/meta-cartoes";
import { montarRelatorioDoDia } from "../../lib/relatorio-do-dia";

const venda = (sale_date: string, sale_value: string, extra = {}) => ({
  sale_date, sale_value, price_tier: "varejo", status: "ativa", ...extra,
});

// Igual ao Radar em 11/11/2026: R$ 5.664,00 vendidos desde 01/11.
const vendas = [
  venda("2026-10-31", "900"), // antes do início: não conta
  venda("2026-11-03", "3553"),
  venda("2026-11-11", "2111"),
  venda("2026-11-10", "800", { status: "cancelada" }),
  venda("2026-11-05", "7000", { price_tier: "atacado" }),
  venda("2026-11-12", "999"), // depois do dia do relatório: não conta
];

describe("meta dos cartões (caixa único, em ordem de vencimento)", () => {
  const m = metaDosCartoes(vendas, "2026-11-11");
  const [riachuelo, santander] = m.cartoes;

  it("caixa = varejo ativo desde 01/11 até o dia", () => {
    expect(m.vendidoCents).toBe(566400);
    expect(m.vendas).toBe(2);
  });

  it("Riachuelo (13/11) já está coberta pelo caixa", () => {
    expect(riachuelo.nome).toBe("Riachuelo");
    expect(riachuelo.guardadoCents).toBe(229000);
    expect(riachuelo.coberto).toBe(true);
    expect(riachuelo.precisaVenderCents).toBe(0);
    expect(riachuelo.diasDeVenda).toBe(2); // 12 e 13/11 (o dia do vencimento conta)
  });

  it("Santander (02/12): sobra da Riachuelo + vendas até as 20h de 02/12", () => {
    expect(santander.guardadoCents).toBe(337400); // 5.664 - 2.290
    expect(santander.faltaCents).toBe(812600);
    expect(santander.precisaVenderCents).toBe(812600); // 2.290 + 11.500 - 5.664
    // 12-14, 17-21, 24-28/11, 01 e 02/12 = 15 dias
    expect(santander.diasDeVenda).toBe(15);
    expect(santander.precisaPorDiaCents).toBe(54174);
  });

  it("se o caixa não cobre o primeiro cartão, o que falta passa para o próximo", () => {
    const pouco = metaDosCartoes([venda("2026-11-03", "1000")], "2026-11-11");
    expect(pouco.cartoes[0].faltaCents).toBe(129000);
    expect(pouco.cartoes[0].precisaVenderCents).toBe(129000);
    expect(pouco.cartoes[1].guardadoCents).toBe(0);
    expect(pouco.cartoes[1].precisaVenderCents).toBe(1279000);
  });

  it("no dia do vencimento não há mais dia de venda depois", () => {
    expect(diasDeVendaAte("2026-11-13", "2026-11-13")).toBe(0);
    expect(diasDeVendaAte("2026-11-14", "2026-11-17")).toBe(1); // só o vencimento, segunda
  });

  it("sobra quando o caixa passa das duas faturas", () => {
    const muito = metaDosCartoes([venda("2026-11-03", "15000")], "2026-11-20");
    expect(muito.sobraCents).toBe(121000);
    expect(muito.cartoes[0].vencido).toBe(true);
  });

  it("aparece no relatório do dia", () => {
    const texto = montarRelatorioDoDia({
      dia: "2026-11-11",
      vendas,
      aReceber: [],
      meta: { hoje: "2026-11-11", partes: [], despesas: [], vendas, entradas: [] },
    });
    expect(texto).toContain("💳 *Meta dos cartões*");
    expect(texto).toContain("• Caixa (vendas desde 01/11): R$ 5.664,00 (2 vendas)");
    expect(texto).toContain("*Riachuelo* · R$ 2.290,00 · vence 13/11");
    expect(texto).toContain("• Fatura coberta ✅");
    expect(texto).toContain("*Santander* · R$ 11.500,00 · vence 02/12");
    expect(texto).toContain("• Já coberto pelo caixa: R$ 3.374,00 (29%)");
    expect(texto).toContain("• Meta: vender R$ 8.126,00 até 02/12 · R$ 541,74 por dia nos 15 dias de venda");
  });
});
