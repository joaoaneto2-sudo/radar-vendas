import { describe, expect, it } from "vitest";
import { computeIncentive, incentiveToColumns, parseIncentiveBody, readPct } from "../../lib/sale-incentive";

describe("desconto", () => {
  it("10% de R$ 200 dá R$ 20 de desconto e o cliente paga R$ 180", () => {
    const r = computeIncentive({ listValue: "200", kind: "desconto", pct: "10" });
    expect(r).toMatchObject({ listCents: 20000, discountCents: 2000, netCents: 18000, earnedCents: 0, usedCents: 0 });
  });

  it("aceita porcentagem com vírgula e arredonda o centavo", () => {
    const r = computeIncentive({ listValue: "99,99", kind: "desconto", pct: "12,5" });
    expect(r.discountCents).toBe(1250); // 12,5% de 99,99 = 12,49875
    expect(r.netCents).toBe(9999 - 1250);
  });

  it("desconto de 0% ou texto inválido não muda nada; acima de 100 vira 100", () => {
    expect(computeIncentive({ listValue: "50", kind: "desconto", pct: "" }).netCents).toBe(5000);
    expect(computeIncentive({ listValue: "50", kind: "desconto", pct: "abc" }).netCents).toBe(5000);
    expect(computeIncentive({ listValue: "50", kind: "desconto", pct: "150" }).netCents).toBe(0);
    expect(computeIncentive({ listValue: "50", kind: "desconto", pct: "-5" }).netCents).toBe(5000);
  });
});

describe("cashback", () => {
  it("o cliente paga o valor cheio e ganha a porcentagem em crédito", () => {
    const r = computeIncentive({ listValue: "200", kind: "cashback", pct: "10" });
    expect(r).toMatchObject({ netCents: 20000, discountCents: 0, earnedCents: 2000 });
  });

  it("o cashback é sobre o que o cliente de fato pagou (depois de usar saldo)", () => {
    const r = computeIncentive({ listValue: "200", kind: "cashback", pct: "10", cashbackUsed: "50", availableCents: 8000 });
    expect(r.usedCents).toBe(5000);
    expect(r.netCents).toBe(15000);
    expect(r.earnedCents).toBe(1500);
  });
});

describe("usar cashback", () => {
  it("abate o valor da venda", () => {
    const r = computeIncentive({ listValue: "200", kind: "nenhum", pct: "", cashbackUsed: "30", availableCents: 5000 });
    expect(r).toMatchObject({ usedCents: 3000, netCents: 17000, earnedCents: 0 });
  });

  it("não passa do saldo do cliente", () => {
    const r = computeIncentive({ listValue: "200", kind: "nenhum", pct: "", cashbackUsed: "80", availableCents: 5000 });
    expect(r.usedCents).toBe(5000);
    expect(r.netCents).toBe(15000);
  });

  it("sem cliente (saldo 0), nada pode ser usado", () => {
    const r = computeIncentive({ listValue: "200", kind: "nenhum", pct: "", cashbackUsed: "30" });
    expect(r.usedCents).toBe(0);
    expect(r.netCents).toBe(20000);
  });

  it("não passa do que falta pagar, mesmo com saldo grande", () => {
    const r = computeIncentive({ listValue: "100", kind: "desconto", pct: "10", cashbackUsed: "500", availableCents: 100000 });
    expect(r.discountCents).toBe(1000);
    expect(r.usedCents).toBe(9000);
    expect(r.netCents).toBe(0);
  });

  it("desconto e cashback usado valem juntos", () => {
    const r = computeIncentive({ listValue: "200", kind: "desconto", pct: "10", cashbackUsed: "30", availableCents: 5000 });
    expect(r.netCents).toBe(20000 - 2000 - 3000);
  });
});

describe("sem desconto nem cashback", () => {
  it("o valor fica como está e nada é guardado à parte", () => {
    const r = computeIncentive({ listValue: "280", kind: "nenhum", pct: "10" }); // % ignorada
    expect(r).toMatchObject({ pct: 0, netCents: 28000, discountCents: 0, earnedCents: 0 });
    expect(incentiveToColumns(r)).toEqual({
      saleValue: 280,
      grossValue: null,
      discountPct: null,
      cashbackPct: null,
      cashbackEarned: 0,
      cashbackUsed: 0,
    });
  });

  it("valor vazio ou inválido vira zero, sem erro", () => {
    expect(computeIncentive({ listValue: "", kind: "desconto", pct: "10" }).netCents).toBe(0);
    expect(computeIncentive({ listValue: "x", kind: "cashback", pct: "10" }).earnedCents).toBe(0);
    expect(computeIncentive({ listValue: null, kind: "nenhum", pct: "" }).netCents).toBe(0);
  });
});

describe("como vira colunas da venda", () => {
  it("desconto: guarda o valor de tabela e a porcentagem", () => {
    const cols = incentiveToColumns(computeIncentive({ listValue: "200", kind: "desconto", pct: "10" }));
    expect(cols).toEqual({ saleValue: 180, grossValue: 200, discountPct: 10, cashbackPct: null, cashbackEarned: 0, cashbackUsed: 0 });
  });

  it("cashback: guarda a porcentagem e o crédito ganho", () => {
    const cols = incentiveToColumns(computeIncentive({ listValue: "200", kind: "cashback", pct: "5" }));
    expect(cols).toEqual({ saleValue: 200, grossValue: 200, discountPct: null, cashbackPct: 5, cashbackEarned: 10, cashbackUsed: 0 });
  });

  it("só usou saldo: guarda o valor de tabela e quanto usou", () => {
    const cols = incentiveToColumns(
      computeIncentive({ listValue: "200", kind: "nenhum", pct: "", cashbackUsed: "20", availableCents: 2000 })
    );
    expect(cols).toMatchObject({ saleValue: 180, grossValue: 200, cashbackUsed: 20, discountPct: null, cashbackPct: null });
  });
});

describe("leitura do que veio da tela (servidor)", () => {
  it("sem a chave gross_value, o bloco não é tocado (chamadas antigas)", () => {
    expect(parseIncentiveBody({ sale_value: "100" })).toBeNull();
  });

  it("lê tipo, porcentagem, valor de tabela e saldo usado", () => {
    expect(
      parseIncentiveBody({ gross_value: "200", incentive_kind: "desconto", incentive_pct: "10", cashback_used: "5" })
    ).toEqual({ kind: "desconto", pct: 10, listValue: "200", cashbackUsed: "5" });
  });

  it("tipo desconhecido vira nenhum; atacado nunca tem desconto nem cashback", () => {
    expect(parseIncentiveBody({ gross_value: "1", incentive_kind: "promo", incentive_pct: "10" })).toMatchObject({
      kind: "nenhum",
      pct: 0,
    });
    expect(
      parseIncentiveBody({ gross_value: "1000", price_tier: "atacado", incentive_kind: "desconto", incentive_pct: "10", cashback_used: "50" })
    ).toMatchObject({ kind: "nenhum", pct: 0, cashbackUsed: null });
  });

  it("porcentagem", () => {
    expect(readPct("7,5")).toBe(7.5);
    expect(readPct("")).toBe(0);
    expect(readPct("300")).toBe(100);
  });
});
