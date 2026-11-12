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
    expect(riachuelo.faltaGuardarCents).toBe(172428);
    expect(riachuelo.precisaVenderCents).toBe(1724280);
    expect(riachuelo.diasDeVenda).toBe(2); // 12 e 13/11
    expect(riachuelo.precisaPorDiaCents).toBe(862140);
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
    expect(m.sugestao!.sobraDepoisDoPrimeiroCents).toBe(337332);
    expect(m.sugestao!.precisaVenderCents).toBe(812668); // 2.290,68 + 11.500 - 5.664
    expect(m.sugestao!.diasDeVenda).toBe(15);
    expect(m.sugestao!.precisaPorDiaCents).toBe(54178);
  });

  it("previsão pela média diária até o vencimento", () => {
    expect(m.diasTrabalhados).toBe(2); // só os dias com venda: 03 e 11/11
    expect(m.mediaPorDiaCents).toBe(283200);
    expect(riachuelo.previsaoGuardadoCents).toBe(113280); // 10% de (5.664 + 2 x 2.832)
    expect(riachuelo.previsaoSaldoCents).toBe(-115788);
    expect(santander.previsaoGuardadoCents).toBe(4332960); // 90% de (5.664 + 15 x 2.832)
    expect(santander.previsaoSaldoCents).toBe(3182960);
    expect(m.sugestao!.previsaoSaldoCents).toBe(3435332);
  });

  it("Riachuelo de dezembro: 10% das vendas a partir de 14/11, vence 13/12", () => {
    const dez = m.cartoes[2];
    expect(dez.nome).toBe("Riachuelo (dez)");
    expect(dez.totalCents).toBe(185316);
    expect(dez.guardadoCents).toBe(0); // ainda não houve venda depois de 13/11
    // de 14/11 a 13/12, terça a sábado: 14, 17-21, 24-28/11, 01-05, 08-12/12 = 21
    expect(dez.diasDeVenda).toBe(21);
    const depois = metaDosCartoes([...vendas, venda("2026-11-18", "1000")], "2026-11-18").cartoes[2];
    expect(depois.guardadoCents).toBe(10000);
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
    expect(texto).toContain("*Riachuelo* · R$ 2.290,68 · vence 13/11 até as 20h · 10% de cada venda");
    expect(texto).toContain("• Meta: vender R$ 17.242,80 · R$ 8.621,40 por dia nos 2 dias de venda");
    expect(texto).toContain("*Santander* · R$ 11.500,00 · vence 02/12 até as 20h · 90% de cada venda");
    expect(texto).toContain("• Meta: vender R$ 7.113,78 · R$ 474,26 por dia nos 15 dias de venda");
    expect(texto).toContain("• Dias com venda desde 01/11: 2 · média de R$ 2.832,00 por dia");
    expect(texto).toContain("• Pela média, até 13/11 às 20h: R$ 1.132,80 guardados · faltam R$ 1.157,88 ⚠️");
    expect(texto).toContain("• Faltam 2 dias de venda até 13/11 e 15 dias de venda até 02/12");
    expect(texto).toContain("não trabalhamos domingo nem segunda");
    expect(texto).toContain("💡 *Sugestão para não pagar juros*");
    expect(texto).toContain("• Pagar a Riachuelo inteira com o caixa (sobram R$ 3.373,32)");
    expect(texto).toContain("• Meta: vender R$ 8.126,68 até 02/12 · R$ 541,78 por dia nos 15 dias de venda");
  });
});
