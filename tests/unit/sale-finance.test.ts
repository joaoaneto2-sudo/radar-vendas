import { describe, expect, it } from "vitest";
import {
  addMonthsISO,
  centsOrZero,
  commissionCents,
  parseSaleFinance,
  paymentsDifference,
  splitCents,
  suggestPayments,
} from "../../lib/sale-finance";

describe("divisão em parcelas", () => {
  it("divide igual e a última parcela leva a sobra de centavos", () => {
    expect(splitCents(10000, 3)).toEqual([3333, 3333, 3334]);
    expect(splitCents(28000, 2)).toEqual([14000, 14000]);
    expect(splitCents(1, 3)).toEqual([0, 0, 1]);
  });

  it("a soma sempre fecha com o total", () => {
    for (const total of [1, 99, 10000, 39846, 250700]) {
      for (const n of [1, 2, 3, 7, 12]) {
        expect(splitCents(total, n).reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("sem valor ou sem parcelas não dá erro", () => {
    expect(splitCents(0, 3)).toEqual([0, 0, 0]);
    expect(splitCents(1000, 0)).toEqual([]);
  });
});

describe("datas por mês", () => {
  it("mesmo dia nos meses seguintes", () => {
    expect(addMonthsISO("2026-09-15", 1)).toBe("2026-10-15");
    expect(addMonthsISO("2026-11-20", 2)).toBe("2027-01-20");
  });

  it("mês sem o dia usa o último dia do mês", () => {
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsISO("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsISO("2026-08-31", 1)).toBe("2026-09-30");
  });
});

describe("parcelas sugeridas do Pix a prazo", () => {
  it("valor igual, uma por mês a partir de um mês depois da venda", () => {
    const linhas = suggestPayments("280", 2, "2026-09-15");
    expect(linhas.map((l) => [l.due_date, l.amount])).toEqual([
      ["2026-10-15", "140.00"],
      ["2026-11-15", "140.00"],
    ]);
    expect(linhas.every((l) => !l.received)).toBe(true);
    expect(paymentsDifference("280", linhas)).toBe(0);
  });

  it("aceita valor com vírgula e mostra a diferença quando não fecha", () => {
    const linhas = suggestPayments("100,00", 3, "2026-09-01");
    expect(paymentsDifference("100,00", linhas)).toBe(0);
    linhas[0].amount = "50";
    expect(paymentsDifference("100,00", linhas)).toBe(5000 - 3333);
  });

  it("sem valor da venda ainda, as parcelas nascem sem valor", () => {
    const linhas = suggestPayments("", 2, "2026-09-01");
    expect(linhas.map((l) => l.amount)).toEqual(["", ""]);
  });
});

describe("comissão do atacado", () => {
  it("20% de R$ 1.500 são R$ 300", () => {
    expect(commissionCents("1500", 20)).toBe(30000);
    expect(commissionCents(1500, 20)).toBe(30000);
  });

  it("sem fabricante representado, sem comissão", () => {
    expect(commissionCents("1500", null)).toBe(0);
    expect(commissionCents("", 20)).toBe(0);
  });

  it("texto inválido vira zero, sem erro", () => {
    expect(centsOrZero("abc")).toBe(0);
    expect(centsOrZero("12,5")).toBe(1250);
  });
});

describe("leitura do que veio da tela (servidor)", () => {
  it("venda simples: só o tipo e os custos; nada mais é exigido", () => {
    const r = parseSaleFinance({ sale_date: "2026-09-19", price_tier: "varejo", sale_costs: "12,50", payment_fee: "3" });
    expect(r).toMatchObject({
      priceTier: "varejo",
      saleCosts: 12.5,
      paymentFee: 3,
      hasManufacturer: false,
      hasStockDate: false,
      payments: null,
    });
  });

  it("nada informado: mantém o que já existe (edição por telas antigas)", () => {
    const r = parseSaleFinance({ sale_date: "2026-09-19" });
    expect(r).toMatchObject({ priceTier: null, saleCosts: null, paymentFee: null, payments: null });
  });

  it("tipo desconhecido é ignorado; custo negativo ou texto vira zero", () => {
    const r = parseSaleFinance({ price_tier: "revenda", sale_costs: "-5", payment_fee: "abc" });
    expect(r.priceTier).toBeNull();
    expect(r.saleCosts).toBe(0);
    expect(r.paymentFee).toBe(0);
  });

  it("parcelas: limpa valores, ignora parcela sem valor e usa a data da venda se recebida sem data", () => {
    const r = parseSaleFinance({
      sale_date: "2026-09-19",
      price_tier: "varejo",
      payments: [
        { due_date: "2026-10-15", amount: "140,00" },
        { due_date: "2026-11-15", amount: "" }, // ignorada
        { due_date: "2026-12-15", amount: "0" }, // ignorada
        { due_date: "", amount: "50", received: true }, // recebida sem nenhuma data
        { due_date: "2026-08-31", amount: "10", received: true, received_date: "2026-09-02" },
        { due_date: "2026-02-31", amount: "10" }, // data que não existe vira sem data
      ],
    });
    expect(r.payments).toEqual([
      { due_date: "2026-10-15", amount: 140, status: "prevista", received_date: null },
      { due_date: null, amount: 50, status: "recebida", received_date: "2026-09-19" },
      { due_date: "2026-08-31", amount: 10, status: "recebida", received_date: "2026-09-02" },
      { due_date: null, amount: 10, status: "prevista", received_date: null },
    ]);
  });

  it("atacado nunca tem parcelas: o dinheiro entra como comissão do fabricante", () => {
    const r = parseSaleFinance({
      price_tier: "atacado",
      manufacturer_id: 3,
      stock_received_date: "2026-09-10",
      payments: [{ due_date: "2026-10-01", amount: "100" }],
    });
    expect(r.payments).toEqual([]);
    expect(r).toMatchObject({ hasManufacturer: true, manufacturerId: 3, hasStockDate: true, stockReceivedDate: "2026-09-10" });
  });

  it("fabricante e data do estoque podem ser limpos (a chave veio vazia)", () => {
    const r = parseSaleFinance({ manufacturer_id: null, stock_received_date: "" });
    expect(r).toMatchObject({ hasManufacturer: true, manufacturerId: null, hasStockDate: true, stockReceivedDate: null });
  });
});
