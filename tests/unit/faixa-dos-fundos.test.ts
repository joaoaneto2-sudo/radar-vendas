import { describe, expect, it } from "vitest";
import { cartoesDosFundos } from "../../lib/faixa-dos-fundos";

const normal = (t: string) => t.replace(/ /g, " ");

const REPOSICAO = {
  enteredCents: 500000,
  paidCents: 200000,
  balanceCents: 300000,
  purchasesTotalCents: 0,
  payableCents: 0,
  balanceMinusPayableCents: 300000,
  initialStockCents: 0,
  totalStockBoughtCents: 0,
  perPurchase: [],
  warnings: [],
};

describe("cartões da faixa de fundos", () => {
  const fundos = [
    { id: 1, name: "Prospecção", active: true },
    { id: 2, name: "Transporte", active: true },
    { id: 3, name: "Antigo", active: false },
  ];
  const contas = [
    { fundId: 1, enteredCents: 12500, spentCents: 2500, balanceCents: 10000, pctThisMonth: 5, enteredThisMonthCents: 12500 },
    { fundId: 2, enteredCents: 0, spentCents: 0, balanceCents: 0, pctThisMonth: 0, enteredThisMonthCents: 0 },
    { fundId: 3, enteredCents: 900, spentCents: 900, balanceCents: 0, pctThisMonth: 0, enteredThisMonthCents: 0 },
  ];
  const cartoes = cartoesDosFundos({ reposicao: REPOSICAO, retailPct: 30, fundos, contas });

  it("o primeiro é o fundo de reposição, depois um por fundo ativo (arquivado não aparece)", () => {
    expect(cartoes.map((c) => c.titulo)).toEqual(["Fundo de reposição", "Prospecção", "Transporte"]);
  });

  it("mostra acumulado, gasto, saldo e a % do mês", () => {
    const rep = cartoes[0];
    expect(normal(rep.acumulado)).toBe("R$ 5.000,00");
    expect(normal(rep.gasto)).toBe("R$ 2.000,00");
    expect(normal(rep.saldo)).toBe("R$ 3.000,00");
    expect(rep.pct).toBe("30% do varejo");
    expect(rep.href).toBe("/financeiro/fundo");

    const pros = cartoes[1];
    expect(normal(pros.acumulado)).toBe("R$ 125,00");
    expect(normal(pros.gasto)).toBe("R$ 25,00");
    expect(normal(pros.saldo)).toBe("R$ 100,00");
    expect(pros.pct).toBe("5% este mês");
    expect(pros.href).toBe("/financeiro/fundos");
  });

  it("fundo em 0% diz que ainda não separa nada", () => {
    expect(cartoes[2].pct).toBe("0% este mês");
  });

  it("marca saldo negativo do fundo de reposição", () => {
    const [rep] = cartoesDosFundos({ reposicao: { ...REPOSICAO, balanceCents: -1000 }, retailPct: 30, fundos: [], contas: [] });
    expect(rep.saldoNegativo).toBe(true);
    expect(cartoes[1].saldoNegativo).toBe(false);
  });

  it("porcentagem com vírgula", () => {
    const [, c] = cartoesDosFundos({
      reposicao: REPOSICAO,
      retailPct: 30,
      fundos: [{ id: 1, name: "X", active: true }],
      contas: [{ fundId: 1, enteredCents: 0, spentCents: 0, balanceCents: 0, pctThisMonth: 2.5, enteredThisMonthCents: 0 }],
    });
    expect(c.pct).toBe("2,5% este mês");
  });
});
