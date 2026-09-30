import { describe, expect, it } from "vitest";
import { SEM_FUNDOS, computeCascade, type ExpenseInput, type ReceiptInput, type SaleInput, type Settings } from "../../lib/finance/cascade";
import type { FundRule } from "../../lib/finance/funds";

const SETTINGS: Settings = { retailPct: 30, wholesalePct: 0, consignmentPct: 30, joaoSharePct: 50, initialStockCents: 1500000, mode: "recebimento" };
const HOJE = "2026-09-15";

const PROSPECCAO = 1;
const TRANSPORTE = 2;
const CUSTOS_FIXOS = 3;
const FUNDOS = [
  { id: PROSPECCAO, name: "Prospecção", active: true },
  { id: TRANSPORTE, name: "Transporte", active: true },
  { id: CUSTOS_FIXOS, name: "Custos fixos", active: true },
];

let seq = 0;
function regra(fundId: number, pct: number, fromMonth: string, toMonth: string | null = null): FundRule {
  seq += 1;
  return { id: seq, fundId, pct, fromMonth, toMonth, createdAt: `2026-09-01T10:00:${String(seq).padStart(2, "0")}.000Z` };
}

function venda(id: number, date: string, amountCents: number, extra: Partial<SaleInput> = {}): SaleInput {
  return { id, date, amountCents, costsCents: 0, tier: "varejo", status: "ativa", paymentMethod: "Pix à vista", payments: [], ...extra };
}

function despesa(id: number, date: string, amountCents: number, fundId: number | null): ExpenseInput {
  return { id, date, amountCents, description: `despesa ${id}`, fundId };
}

const REGRAS_DO_EXEMPLO = [regra(PROSPECCAO, 5, "2026-09-01"), regra(TRANSPORTE, 3, "2026-09-01"), regra(CUSTOS_FIXOS, 4, "2026-09-01")];
const conta = (r: ReturnType<typeof computeCascade>, fundId: number) => r.funds.find((f) => f.fundId === fundId)!;

describe("fundos na cascata: o exemplo de R$ 250", () => {
  const r = computeCascade(SETTINGS, [venda(1, "2026-09-01", 25000)], [], [], [], { funds: FUNDOS, rules: REGRAS_DO_EXEMPLO, today: HOJE });
  const e = r.events[0];

  it("separa a reposição e cada fundo do valor da venda", () => {
    expect(e.replenishCents).toBe(7500);
    expect(e.fundsCents).toEqual({ [PROSPECCAO]: 1250, [TRANSPORTE]: 750, [CUSTOS_FIXOS]: 1000 });
  });

  it("o lucro a dividir cai: 145,00, ou 72,50 para cada um", () => {
    expect(e.profitCents).toBe(14500);
    expect(e.distributableCents).toBe(14500);
    expect(e.joaoShareCents).toBe(7250);
    expect(e.fernandaShareCents).toBe(7250);
  });

  it("cada fundo acumula o que recebeu e mostra o saldo", () => {
    expect(conta(r, PROSPECCAO)).toMatchObject({ enteredCents: 1250, spentCents: 0, balanceCents: 1250, pctThisMonth: 5, enteredThisMonthCents: 1250 });
    expect(conta(r, CUSTOS_FIXOS).balanceCents).toBe(1000);
    expect(r.totals.fundsCents).toBe(3000);
  });

  it("a soma das partes continua fechando", () => {
    expect(r.check.fernandaPlusJoaoEqualsDistributable).toBe(true);
  });
});

describe("a % é por mês", () => {
  it("cada venda usa a % do mês da própria data; o passado não muda", () => {
    const regras = [regra(PROSPECCAO, 5, "2026-10-01")]; // só começa em outubro
    const r = computeCascade(
      SETTINGS,
      [venda(1, "2026-09-10", 10000), venda(2, "2026-10-10", 10000)],
      [],
      [],
      [],
      { funds: FUNDOS, rules: regras, today: HOJE }
    );
    expect(r.events[0].fundsCents[PROSPECCAO]).toBe(0);
    expect(r.events[1].fundsCents[PROSPECCAO]).toBe(500);
    expect(conta(r, PROSPECCAO).pctThisMonth).toBe(0); // hoje é setembro
    expect(conta(r, PROSPECCAO).enteredThisMonthCents).toBe(0);
    expect(conta(r, PROSPECCAO).enteredCents).toBe(500);
  });

  it("uma exceção de um mês volta sozinha à regra anterior", () => {
    const regras = [regra(PROSPECCAO, 5, "2026-09-01"), regra(PROSPECCAO, 8, "2026-10-01", "2026-10-01")];
    const r = computeCascade(
      SETTINGS,
      [venda(1, "2026-09-10", 10000), venda(2, "2026-10-10", 10000), venda(3, "2026-11-10", 10000)],
      [],
      [],
      [],
      { funds: FUNDOS, rules: regras, today: HOJE }
    );
    expect(r.events.map((e) => e.fundsCents[PROSPECCAO])).toEqual([500, 800, 500]);
  });
});

describe("despesa paga com fundo", () => {
  const regras = [regra(CUSTOS_FIXOS, 4, "2026-09-01")];
  const fundos = { funds: FUNDOS, rules: regras, today: HOJE };
  const V = venda(1, "2026-09-01", 25000); // custos fixos ficam com 1000

  it("o fundo paga o que tem; o resto vai para 'a compensar'", () => {
    const r = computeCascade(SETTINGS, [V], [], [despesa(1, "2026-09-02", 15000, CUSTOS_FIXOS)], [], fundos);
    const d = r.events.find((e) => e.kind === "despesa")!;
    expect(d.fundCoveredCents).toBe(1000);
    expect(d.carryAfterCents).toBe(14000);
    expect(conta(r, CUSTOS_FIXOS)).toMatchObject({ spentCents: 1000, balanceCents: 0 });
    expect(r.totals.expensesCents).toBe(15000);
    expect(r.totals.fundCoveredCents).toBe(1000);
  });

  it("com saldo de sobra, o fundo paga tudo e nada sai do lucro", () => {
    const r = computeCascade(SETTINGS, [V], [], [despesa(1, "2026-09-02", 600, CUSTOS_FIXOS)], [], fundos);
    const d = r.events.find((e) => e.kind === "despesa")!;
    expect(d.fundCoveredCents).toBe(600);
    expect(d.carryAfterCents).toBe(0);
    expect(conta(r, CUSTOS_FIXOS).balanceCents).toBe(400);
  });

  it("no mesmo dia, a despesa vem antes da venda: ainda não há saldo", () => {
    const r = computeCascade(SETTINGS, [V], [], [despesa(1, "2026-09-01", 600, CUSTOS_FIXOS)], [], fundos);
    const d = r.events.find((e) => e.kind === "despesa")!;
    expect(d.fundCoveredCents).toBe(0);
    expect(d.carryAfterCents).toBe(600);
  });

  it("despesa sem fundo continua saindo do lucro, como hoje", () => {
    const r = computeCascade(SETTINGS, [V], [], [despesa(1, "2026-09-02", 600, null)], [], fundos);
    const d = r.events.find((e) => e.kind === "despesa")!;
    expect(d.fundCoveredCents).toBe(0);
    expect(d.carryAfterCents).toBe(600);
  });

  it("o saldo nunca fica negativo, mesmo com duas despesas seguidas", () => {
    const r = computeCascade(
      SETTINGS,
      [V],
      [],
      [despesa(1, "2026-09-02", 800, CUSTOS_FIXOS), despesa(2, "2026-09-03", 800, CUSTOS_FIXOS)],
      [],
      fundos
    );
    const cobertos = r.events.filter((e) => e.kind === "despesa").map((e) => e.fundCoveredCents);
    expect(cobertos).toEqual([800, 200]);
    expect(conta(r, CUSTOS_FIXOS).balanceCents).toBe(0);
  });
});

describe("o que entra e o que não entra nos fundos", () => {
  const fundos = { funds: FUNDOS, rules: [regra(PROSPECCAO, 5, "2026-09-01")], today: HOJE };

  it("venda cancelada não separa nada", () => {
    const r = computeCascade(SETTINGS, [venda(1, "2026-09-01", 10000, { status: "cancelada" })], [], [], [], fundos);
    expect(r.events).toEqual([]);
    expect(conta(r, PROSPECCAO).enteredCents).toBe(0);
  });

  it("outra receita entra; aporte de sócio não entra", () => {
    const receitas: ReceiptInput[] = [
      { id: 1, kind: "outra_receita", status: "recebida", receivedDate: "2026-09-03", expectedDate: null, amountCents: 10000 },
      { id: 2, kind: "aporte_socio", status: "recebida", receivedDate: "2026-09-04", expectedDate: null, amountCents: 50000, partner: "joao" },
    ];
    const r = computeCascade(SETTINGS, [], [], [], receitas, fundos);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].fundsCents[PROSPECCAO]).toBe(500);
    expect(r.events[0].profitCents).toBe(9500);
  });

  it("um fundo arquivado continua contando o passado", () => {
    const antigo = { id: 9, name: "Antigo", active: false };
    const r = computeCascade(
      SETTINGS,
      [venda(1, "2026-08-10", 10000)],
      [],
      [],
      [],
      { funds: [...FUNDOS, antigo], rules: [regra(9, 5, "2026-08-01", "2026-08-01")], today: HOJE }
    );
    expect(r.events[0].fundsCents[9]).toBe(500);
    expect(conta(r, 9)).toMatchObject({ enteredCents: 500, pctThisMonth: 0 });
  });
});

describe("regressão: sem fundos, nada muda", () => {
  const vendas = [venda(1, "2026-09-01", 25000), venda(2, "2026-09-05", 12000, { costsCents: 300 })];
  const despesas = [despesa(1, "2026-09-03", 700, null)];

  it("sem o parâmetro dos fundos, o resultado é o de sempre e os fundos ficam vazios", () => {
    const r = computeCascade(SETTINGS, vendas, [], despesas);
    expect(r.funds).toEqual([]);
    expect(r.totals.fundsCents).toBe(0);
    expect(r.totals.fundCoveredCents).toBe(0);
    expect(r.events.every((e) => Object.keys(e.fundsCents).length === 0)).toBe(true);
  });

  it("com fundos existindo, mas todos em 0%, os números são idênticos", () => {
    const sem = computeCascade(SETTINGS, vendas, [], despesas, [], SEM_FUNDOS);
    const zero = computeCascade(SETTINGS, vendas, [], despesas, [], { funds: FUNDOS, rules: [], today: HOJE });
    const campos = (r: typeof sem) =>
      r.events.map((e) => [e.key, e.baseCents, e.replenishCents, e.profitCents, e.distributableCents, e.joaoShareCents, e.fernandaShareCents, e.carryAfterCents, e.debtAfterCents]);
    expect(campos(zero)).toEqual(campos(sem));
    expect(zero.totals).toEqual(sem.totals);
    expect(zero.debt).toEqual(sem.debt);
  });
});
