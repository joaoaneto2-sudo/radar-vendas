import { describe, expect, it } from "vitest";
import {
  computeCascade,
  type ExpenseInput,
  type JoaoPaymentInput,
  type SaleInput,
  type Settings,
} from "../../lib/finance/cascade";
import { ESPERADO, SETTINGS_ACORDO, vendasDoBriefing } from "../fixtures";

function venda(parcial: Partial<SaleInput> & { id: number; amountCents: number }): SaleInput {
  return {
    date: "2026-09-01",
    costsCents: 0,
    tier: "varejo",
    status: "ativa",
    paymentMethod: "Pix à vista",
    payments: [],
    ...parcial,
  };
}

// Venda de atacado da Bia Belutti: 20% de comissão, 15 dias depois do estoque.
function atacado(parcial: Partial<SaleInput> & { id: number; amountCents: number }): SaleInput {
  return venda({
    tier: "atacado",
    paymentMethod: null,
    manufacturerId: 1,
    manufacturerName: "Bia Belutti",
    commissionPct: 20,
    commissionDays: 15,
    ...parcial,
  });
}

const pagamentoJoao = (id: number, date: string, amountCents: number): JoaoPaymentInput => ({
  id,
  date,
  amountCents,
});

const despesa = (id: number, date: string, amountCents: number): ExpenseInput => ({ id, date, amountCents });

const PAGAMENTO_INICIAL: JoaoPaymentInput[] = [pagamentoJoao(1, "2026-09-01", 100000)]; // R$ 1.000

describe("teste de aceitação do briefing (seção 6)", () => {
  it("modo 'venda': todos os números batem", () => {
    const r = computeCascade(SETTINGS_ACORDO, vendasDoBriefing(), PAGAMENTO_INICIAL);

    expect(r.totals.soldCents).toBe(ESPERADO.vendido);
    expect(r.totals.replenishCents).toBe(ESPERADO.reposicao);
    expect(r.totals.costsCents).toBe(0);
    expect(r.totals.profitCents).toBe(ESPERADO.lucro);
    expect(r.totals.distributableCents).toBe(ESPERADO.lucro);
    expect(r.totals.abatedCents).toBe(ESPERADO.abatido);
    expect(r.debt.totalCents).toBe(750000);
    expect(r.debt.paidDirectCents).toBe(100000);
    expect(r.debt.balanceCents).toBe(ESPERADO.saldoDevedor);
    expect(r.debt.paidFraction).toBeCloseTo(0.4268, 4); // 42,7% quitado
    expect(r.totals.fernandaReceivesCents).toBe(ESPERADO.fernandaRecebe);
    expect(r.totals.joaoReceivesCents).toBe(ESPERADO.joaoRecebe);
    expect(r.check.fernandaPlusJoaoEqualsDistributable).toBe(true);
  });

  it("modo 'recebimento' com vendas sem parcelas dá os mesmos números (contam como recebidas na data da venda)", () => {
    const r = computeCascade({ ...SETTINGS_ACORDO, mode: "recebimento" }, vendasDoBriefing(), PAGAMENTO_INICIAL);

    expect(r.totals.soldCents).toBe(ESPERADO.vendido);
    expect(r.totals.pendingCents).toBe(0);
    expect(r.totals.replenishCents).toBe(ESPERADO.reposicao);
    expect(r.totals.profitCents).toBe(ESPERADO.lucro);
    expect(r.totals.abatedCents).toBe(ESPERADO.abatido);
    expect(r.debt.balanceCents).toBe(ESPERADO.saldoDevedor);
    expect(r.events.every((e) => e.implicit)).toBe(true);
  });

  it("avisa que 9 vendas estão sem forma de pagamento informada", () => {
    const r = computeCascade(SETTINGS_ACORDO, vendasDoBriefing(), PAGAMENTO_INICIAL);
    const aviso = r.warnings.find((w) => w.code === "pagamento_nao_informado");
    expect(aviso?.saleIds).toHaveLength(9);
  });

  it("centavos: a venda de R$ 82,50 divide o lucro de R$ 57,75 em 28,88 (João) e 28,87 (Fernanda)", () => {
    const r = computeCascade(SETTINGS_ACORDO, vendasDoBriefing(), PAGAMENTO_INICIAL);
    const giovana = r.events.find((e) => e.saleId === 3)!;
    expect(giovana.replenishCents).toBe(2475);
    expect(giovana.profitCents).toBe(5775);
    expect(giovana.joaoShareCents).toBe(2888);
    expect(giovana.fernandaShareCents).toBe(2887);
  });
});

describe("dívida do João", () => {
  const acordoPequeno: Settings = { ...SETTINGS_ACORDO, initialStockCents: 100000 }; // dívida de R$ 500

  it("zera no meio de uma venda: só o que falta é abatido, o resto vai para o João", () => {
    const vendas = [
      venda({ id: 1, amountCents: 100000, date: "2026-09-01" }),
      venda({ id: 2, amountCents: 100000, date: "2026-09-02" }),
      venda({ id: 3, amountCents: 100000, date: "2026-09-03" }),
    ];
    const r = computeCascade(acordoPequeno, vendas, []);
    const [e1, e2, e3] = r.events;

    // Cada venda de R$ 1.000: reposição 300, lucro 700, parte de cada um 350.
    expect(e1.abatementCents).toBe(35000);
    expect(e1.debtAfterCents).toBe(15000);

    expect(e2.debtBeforeCents).toBe(15000);
    expect(e2.abatementCents).toBe(15000); // só o que faltava
    expect(e2.joaoReceivesCents).toBe(20000);
    expect(e2.fernandaReceivesCents).toBe(50000);

    expect(e3.abatementCents).toBe(0);
    expect(e3.joaoReceivesCents).toBe(35000);
    expect(e3.fernandaReceivesCents).toBe(35000);

    expect(r.debt.balanceCents).toBe(0);
    expect(r.debt.paidFraction).toBe(1);
    expect(r.totals.abatedCents).toBe(50000);
  });

  it("pagamento do João vale a partir da sua data e não reescreve o passado", () => {
    const vendas = [venda({ id: 1, amountCents: 100000, date: "2026-09-01" })];

    const semPagamento = computeCascade(SETTINGS_ACORDO, vendas, []);
    const comPagamentoDepois = computeCascade(SETTINGS_ACORDO, vendas, [pagamentoJoao(1, "2026-09-10", 100000)]);

    // A venda de 01/09 continua igual.
    expect(comPagamentoDepois.events[0]).toEqual(semPagamento.events[0]);
    // Mas o saldo final considera o pagamento feito depois.
    expect(semPagamento.debt.balanceCents).toBe(750000 - 35000);
    expect(comPagamentoDepois.debt.balanceCents).toBe(750000 - 35000 - 100000);
  });

  it("pagamento no mesmo dia da venda já conta para aquela venda", () => {
    const vendas = [venda({ id: 1, amountCents: 100000, date: "2026-09-01" })];
    const r = computeCascade(SETTINGS_ACORDO, vendas, [pagamentoJoao(1, "2026-09-01", 100000)]);
    expect(r.events[0].debtBeforeCents).toBe(650000);
  });

  it("pagar além da dívida zera o saldo, registra o excesso e avisa", () => {
    const r = computeCascade(acordoPequeno, [], [pagamentoJoao(1, "2026-09-01", 80000)]);
    expect(r.debt.balanceCents).toBe(0);
    expect(r.debt.excessPaidCents).toBe(30000);
    expect(r.warnings.some((w) => w.code === "pagamento_alem_da_divida")).toBe(true);
  });
});

describe("regras de cada venda", () => {
  it("custos da venda saem do lucro, não da reposição", () => {
    const r = computeCascade(SETTINGS_ACORDO, [venda({ id: 1, amountCents: 10000, costsCents: 1000 })], []);
    expect(r.events[0].replenishCents).toBe(3000);
    expect(r.events[0].profitCents).toBe(6000);
  });

  it("venda cancelada não entra em nada", () => {
    const r = computeCascade(
      SETTINGS_ACORDO,
      [venda({ id: 1, amountCents: 100000 }), venda({ id: 2, amountCents: 50000, status: "cancelada" })],
      []
    );
    expect(r.totals.soldCents).toBe(100000);
    expect(r.events).toHaveLength(1);
  });

  it("venda sem valor é ignorada e gera aviso", () => {
    const r = computeCascade(SETTINGS_ACORDO, [venda({ id: 1, amountCents: 0 })], []);
    expect(r.events).toHaveLength(0);
    expect(r.warnings.find((w) => w.code === "venda_sem_valor")?.saleIds).toEqual([1]);
  });

  it("a ordem dos eventos é sempre a do tempo, mesmo com a lista embaralhada", () => {
    const r = computeCascade(
      SETTINGS_ACORDO,
      [
        venda({ id: 5, amountCents: 1000, date: "2026-09-02" }),
        venda({ id: 2, amountCents: 1000, date: "2026-09-02" }),
        venda({ id: 9, amountCents: 1000, date: "2026-09-01" }),
      ],
      []
    );
    expect(r.events.map((e) => e.saleId)).toEqual([9, 2, 5]);
  });
});

describe("consignado", () => {
  it("usa a reposição própria do consignado (30% por padrão, igual ao varejo)", () => {
    const r = computeCascade(SETTINGS_ACORDO, [venda({ id: 1, amountCents: 100000, tier: "consignado" })], []);
    expect(r.events[0].tier).toBe("consignado");
    expect(r.events[0].replenishCents).toBe(30000);
    expect(r.totals.soldCents).toBe(100000); // conta como venda
  });

  it("o percentual do consignado é configurável, separado do varejo", () => {
    const r = computeCascade(
      { ...SETTINGS_ACORDO, consignmentPct: 20 },
      [
        venda({ id: 1, amountCents: 100000, tier: "consignado" }),
        venda({ id: 2, amountCents: 100000, tier: "varejo" }),
      ],
      []
    );
    expect(r.events.find((e) => e.saleId === 1)!.replenishCents).toBe(20000);
    expect(r.events.find((e) => e.saleId === 2)!.replenishCents).toBe(30000);
  });
});

describe("atacado: a receita é a comissão do fabricante", () => {
  it("modo 'venda': entra só a comissão (20%), sem reposição, e o valor cheio não conta como vendido", () => {
    const r = computeCascade(SETTINGS_ACORDO, [atacado({ id: 1, amountCents: 100000 })], []);
    const e = r.events[0];
    expect(e.baseCents).toBe(20000);
    expect(e.replenishCents).toBe(0);
    expect(e.profitCents).toBe(20000);
    expect(e.joaoShareCents).toBe(10000);
    expect(e.abatementCents).toBe(10000); // enquanto o João deve, a parte dele abate a dívida
    expect(r.totals.soldCents).toBe(0);
    expect(r.totals.wholesaleCommissionCountedCents).toBe(20000);
  });

  it("a reposição sobre a comissão é configurável (0% por padrão)", () => {
    const r = computeCascade({ ...SETTINGS_ACORDO, wholesalePct: 10 }, [atacado({ id: 1, amountCents: 100000 })], []);
    expect(r.events[0].replenishCents).toBe(2000);
    expect(r.events[0].profitCents).toBe(18000);
  });

  it("custos da venda saem da comissão", () => {
    const r = computeCascade(SETTINGS_ACORDO, [atacado({ id: 1, amountCents: 100000, costsCents: 1000 })], []);
    expect(r.events[0].profitCents).toBe(19000);
  });

  it("modo 'recebimento': enquanto o fabricante não paga, a comissão não conta", () => {
    const r = computeCascade(
      { ...SETTINGS_ACORDO, mode: "recebimento" },
      [atacado({ id: 1, amountCents: 100000, stockReceivedDate: "2026-09-14" })],
      []
    );
    expect(r.events).toHaveLength(0);
    expect(r.totals.profitCents).toBe(0);
    expect(r.totals.soldCents).toBe(0);
  });

  it("modo 'recebimento': a comissão entra na data em que o fabricante pagou", () => {
    const r = computeCascade(
      { ...SETTINGS_ACORDO, mode: "recebimento" },
      [
        atacado({
          id: 1,
          amountCents: 100000,
          date: "2026-09-12",
          stockReceivedDate: "2026-09-14",
          payments: [
            { id: 7, dueDate: "2026-09-29", amountCents: 20000, status: "recebida", receivedDate: "2026-09-30" },
          ],
        }),
      ],
      []
    );
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ kind: "parcela", tier: "atacado", date: "2026-09-30", baseCents: 20000 });
    expect(r.totals.wholesaleCommissionCountedCents).toBe(20000);
  });

  it("parcela de comissão ainda prevista (sem data) não conta e não dá erro", () => {
    const r = computeCascade(
      { ...SETTINGS_ACORDO, mode: "recebimento" },
      [
        atacado({
          id: 1,
          amountCents: 100000,
          payments: [{ id: 7, dueDate: null, amountCents: 20000, status: "prevista", receivedDate: null }],
        }),
      ],
      []
    );
    expect(r.events).toHaveLength(0);
    expect(r.warnings.some((w) => w.code === "parcelas_diferem_da_venda")).toBe(false);
  });

  it("avisa se as parcelas de comissão não somam a comissão", () => {
    const r = computeCascade(
      { ...SETTINGS_ACORDO, mode: "recebimento" },
      [
        atacado({
          id: 3,
          amountCents: 100000,
          payments: [{ id: 7, dueDate: "2026-09-29", amountCents: 15000, status: "prevista", receivedDate: null }],
        }),
      ],
      []
    );
    expect(r.warnings.find((w) => w.code === "parcelas_diferem_da_venda")?.saleIds).toEqual([3]);
  });

  it("atacado sem fabricante representado fica fora das contas e avisa", () => {
    const r = computeCascade(
      SETTINGS_ACORDO,
      [atacado({ id: 4, amountCents: 100000, commissionPct: null, manufacturerId: null })],
      []
    );
    expect(r.events).toHaveLength(0);
    expect(r.totals.profitCents).toBe(0);
    expect(r.warnings.find((w) => w.code === "atacado_sem_fabricante_representado")?.saleIds).toEqual([4]);
  });

  it("atacado e varejo juntos: 'total vendido' só conta o varejo", () => {
    const r = computeCascade(
      SETTINGS_ACORDO,
      [venda({ id: 1, amountCents: 100000 }), atacado({ id: 2, amountCents: 500000 })],
      []
    );
    expect(r.totals.soldCents).toBe(100000);
    expect(r.totals.profitCents).toBe(70000 + 100000); // varejo 700 + comissão de 20% sobre 5.000
  });
});

describe("despesas da empresa: saem antes da divisão", () => {
  it("a despesa lançada antes é descontada do lucro da próxima venda", () => {
    const r = computeCascade(
      SETTINGS_ACORDO,
      [venda({ id: 1, amountCents: 100000, date: "2026-09-02" })],
      [],
      [despesa(1, "2026-09-01", 10000)]
    );
    const [d, v] = r.events;
    expect(d).toMatchObject({ kind: "despesa", expenseCents: 10000, carryAfterCents: 10000, distributableCents: 0 });
    expect(v.profitCents).toBe(70000);
    expect(v.compensatedCents).toBe(10000);
    expect(v.distributableCents).toBe(60000);
    expect(v.joaoShareCents).toBe(30000);
    expect(v.carryAfterCents).toBe(0);
  });

  it("se um lucro não cobre a despesa, o resto vai sendo descontado dos próximos", () => {
    const r = computeCascade(
      SETTINGS_ACORDO,
      [
        venda({ id: 1, amountCents: 100000, date: "2026-09-02" }),
        venda({ id: 2, amountCents: 100000, date: "2026-09-03" }),
      ],
      [],
      [despesa(1, "2026-09-01", 100000)]
    );
    const [, v1, v2] = r.events;
    expect(v1.compensatedCents).toBe(70000);
    expect(v1.distributableCents).toBe(0);
    expect(v1.carryAfterCents).toBe(30000);
    expect(v2.compensatedCents).toBe(30000);
    expect(v2.distributableCents).toBe(40000);
    expect(v2.carryAfterCents).toBe(0);
    expect(r.totals.carryCents).toBe(0);
  });

  it("despesa depois de lucros já divididos não desfaz o passado: fica a compensar", () => {
    const r = computeCascade(
      SETTINGS_ACORDO,
      [venda({ id: 1, amountCents: 100000, date: "2026-09-01" })],
      [],
      [despesa(1, "2026-09-05", 10000)]
    );
    expect(r.events[0].distributableCents).toBe(70000);
    expect(r.totals.expensesCents).toBe(10000);
    expect(r.totals.carryCents).toBe(10000);
    expect(r.totals.distributableCents).toBe(70000);
  });

  it("despesa e venda no mesmo dia: a despesa desconta da venda daquele dia", () => {
    const r = computeCascade(
      SETTINGS_ACORDO,
      [venda({ id: 1, amountCents: 100000, date: "2026-09-01" })],
      [],
      [despesa(1, "2026-09-01", 10000)]
    );
    expect(r.events.map((e) => e.kind)).toEqual(["despesa", "venda"]);
    expect(r.events[1].distributableCents).toBe(60000);
  });

  it("prejuízo de uma venda (custos maiores que o lucro) também vira compensação", () => {
    const r = computeCascade(
      SETTINGS_ACORDO,
      [
        venda({ id: 1, amountCents: 100000, costsCents: 80000, date: "2026-09-01" }),
        venda({ id: 2, amountCents: 100000, date: "2026-09-02" }),
      ],
      []
    );
    const [e1, e2] = r.events;
    expect(e1.profitCents).toBe(-10000);
    expect(e1.lossCarriedCents).toBe(10000);
    expect(e1.distributableCents).toBe(0);
    expect(e1.joaoShareCents).toBe(0);
    expect(e1.abatementCents).toBe(0);
    expect(e2.compensatedCents).toBe(10000);
    expect(e2.distributableCents).toBe(60000);
  });

  it("despesa zerada ou negativa é ignorada", () => {
    const r = computeCascade(SETTINGS_ACORDO, [], [], [despesa(1, "2026-09-01", 0), despesa(2, "2026-09-01", -5)]);
    expect(r.events).toHaveLength(0);
  });

  it("com uma despesa de R$ 100 em 05/09, o briefing muda só o que deve mudar", () => {
    const r = computeCascade(SETTINGS_ACORDO, vendasDoBriefing(), PAGAMENTO_INICIAL, [despesa(1, "2026-09-05", 10000)]);

    expect(r.totals.soldCents).toBe(ESPERADO.vendido);
    expect(r.totals.profitCents).toBe(ESPERADO.lucro); // lucro das vendas, antes da despesa
    expect(r.totals.expensesCents).toBe(10000);
    expect(r.totals.compensatedCents).toBe(10000); // descontada da venda da Elizabete (06/09)
    expect(r.totals.carryCents).toBe(0);
    expect(r.totals.distributableCents).toBe(ESPERADO.lucro - 10000); // 4.301,57
    expect(r.totals.abatedCents).toBe(ESPERADO.abatido - 5000); // o João abate R$ 50 a menos
    expect(r.debt.balanceCents).toBe(ESPERADO.saldoDevedor + 5000);
    expect(r.totals.fernandaReceivesCents).toBe(ESPERADO.lucro - 10000);
    expect(r.check.fernandaPlusJoaoEqualsDistributable).toBe(true);
  });
});

describe("modo 'recebimento' com parcelas", () => {
  const acordoRecebimento: Settings = { ...SETTINGS_ACORDO, mode: "recebimento" };

  it("só a parcela recebida entra; o resto fica como 'ainda a receber'", () => {
    const v = venda({
      id: 1,
      amountCents: 100000,
      costsCents: 1000,
      paymentMethod: "Pix parcelado",
      payments: [
        { id: 10, dueDate: "2026-09-10", amountCents: 50000, status: "recebida", receivedDate: "2026-09-12" },
        { id: 11, dueDate: "2026-10-10", amountCents: 50000, status: "prevista", receivedDate: null },
      ],
    });
    const r = computeCascade(acordoRecebimento, [v], []);

    expect(r.events).toHaveLength(1);
    expect(r.events[0].date).toBe("2026-09-12"); // vale a data em que o dinheiro entrou
    expect(r.events[0].baseCents).toBe(50000);
    expect(r.events[0].replenishCents).toBe(15000);
    expect(r.events[0].costsCents).toBe(500); // metade dos custos
    expect(r.totals.soldCents).toBe(100000);
    expect(r.totals.countedCents).toBe(50000);
    expect(r.totals.pendingCents).toBe(50000);
  });

  it("o mesmo caso no modo 'venda' conta tudo na data da venda", () => {
    const v = venda({
      id: 1,
      amountCents: 100000,
      payments: [{ id: 10, dueDate: "2026-10-10", amountCents: 100000, status: "prevista", receivedDate: null }],
    });
    const r = computeCascade({ ...SETTINGS_ACORDO, mode: "venda" }, [v], []);
    expect(r.totals.countedCents).toBe(100000);
    expect(r.totals.pendingCents).toBe(0);
  });

  it("os custos repartidos entre as parcelas somam exatamente o total (sobra de centavos na última)", () => {
    const v = venda({
      id: 1,
      amountCents: 100000,
      costsCents: 1001,
      payments: [
        { id: 1, dueDate: "2026-09-10", amountCents: 33333, status: "recebida", receivedDate: "2026-09-10" },
        { id: 2, dueDate: "2026-10-10", amountCents: 33333, status: "recebida", receivedDate: "2026-10-10" },
        { id: 3, dueDate: "2026-11-10", amountCents: 33334, status: "recebida", receivedDate: "2026-11-10" },
      ],
    });
    const r = computeCascade(acordoRecebimento, [v], []);
    expect(r.events.map((e) => e.costsCents)).toEqual([334, 334, 333]);
    expect(r.totals.costsCents).toBe(1001);
    expect(r.check.fernandaPlusJoaoEqualsDistributable).toBe(true);
  });

  it("avisa quando as parcelas não somam o valor da venda", () => {
    const v = venda({
      id: 7,
      amountCents: 100000,
      payments: [{ id: 1, dueDate: "2026-09-10", amountCents: 90000, status: "prevista", receivedDate: null }],
    });
    const r = computeCascade(acordoRecebimento, [v], []);
    expect(r.warnings.find((w) => w.code === "parcelas_diferem_da_venda")?.saleIds).toEqual([7]);
  });

  it("parcela recebida sem data usa a data prevista e avisa", () => {
    const v = venda({
      id: 3,
      amountCents: 10000,
      payments: [{ id: 1, dueDate: "2026-09-10", amountCents: 10000, status: "recebida", receivedDate: null }],
    });
    const r = computeCascade(acordoRecebimento, [v], []);
    expect(r.events[0].date).toBe("2026-09-10");
    expect(r.warnings.some((w) => w.code === "recebida_sem_data")).toBe(true);
  });
});

describe("propriedades (cenários aleatórios, sempre os mesmos)", () => {
  // Gerador simples e determinístico, para o teste dar sempre o mesmo resultado.
  function sorteio(semente: number) {
    let estado = semente;
    return () => {
      estado = (estado * 1664525 + 1013904223) % 4294967296;
      return estado / 4294967296;
    };
  }

  it("as contas sempre fecham, em qualquer combinação de vendas, atacado, consignado, despesas e pagamentos", () => {
    const rnd = sorteio(2026);
    for (let cenario = 0; cenario < 400; cenario++) {
      const modo = rnd() < 0.5 ? "venda" : "recebimento";
      const acordo: Settings = {
        retailPct: Math.round(rnd() * 5000) / 100,
        wholesalePct: Math.round(rnd() * 3000) / 100,
        consignmentPct: Math.round(rnd() * 5000) / 100,
        joaoSharePct: Math.round(rnd() * 10000) / 100,
        initialStockCents: Math.round(rnd() * 3000000),
        mode: modo,
      };
      const vendas: SaleInput[] = [];
      const qtd = 1 + Math.floor(rnd() * 12);
      for (let i = 1; i <= qtd; i++) {
        const valor = 1 + Math.floor(rnd() * 500000);
        const custos = Math.floor(rnd() * valor * 0.3);
        const dia = 1 + Math.floor(rnd() * 28);
        const parcelas = Math.floor(rnd() * 4); // 0 a 3 parcelas
        const pagamentos = [];
        let restante = valor;
        for (let p = 1; p <= parcelas; p++) {
          const parte = p === parcelas ? restante : Math.floor(restante * rnd());
          restante -= parte;
          const recebida = rnd() < 0.6;
          pagamentos.push({
            id: i * 10 + p,
            dueDate: `2026-10-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`,
            amountCents: parte,
            status: recebida ? ("recebida" as const) : ("prevista" as const),
            receivedDate: recebida ? `2026-10-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}` : null,
          });
        }
        const sorteioTipo = rnd();
        vendas.push({
          id: i,
          date: `2026-09-${String(dia).padStart(2, "0")}`,
          amountCents: valor,
          costsCents: custos,
          tier: sorteioTipo < 0.55 ? "varejo" : sorteioTipo < 0.75 ? "consignado" : "atacado",
          status: rnd() < 0.9 ? "ativa" : "cancelada",
          paymentMethod: null,
          payments: pagamentos,
          commissionPct: rnd() < 0.8 ? Math.round(rnd() * 3000) / 100 : null,
        });
      }
      const pagJoao: JoaoPaymentInput[] = [];
      if (rnd() < 0.6) pagJoao.push(pagamentoJoao(1, "2026-09-05", Math.floor(rnd() * 800000) + 1));
      const despesas: ExpenseInput[] = [];
      const nDespesas = Math.floor(rnd() * 4);
      for (let d = 1; d <= nDespesas; d++) {
        despesas.push(despesa(d, `2026-09-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`, 1 + Math.floor(rnd() * 200000)));
      }

      const r = computeCascade(acordo, vendas, pagJoao, despesas);

      expect(r.check.fernandaPlusJoaoEqualsDistributable).toBe(true);
      expect(r.debt.balanceCents).toBeGreaterThanOrEqual(0);
      expect(r.totals.abatedCents).toBeLessThanOrEqual(r.debt.totalCents);
      expect(r.totals.carryCents).toBeGreaterThanOrEqual(0);

      // O que sobra a compensar = despesas + prejuízos - o que já foi compensado.
      const prejuizos = r.events.reduce((s, e) => s + e.lossCarriedCents, 0);
      expect(r.totals.carryCents).toBe(r.totals.expensesCents + prejuizos - r.totals.compensatedCents);

      for (const e of r.events) {
        expect(e.abatementCents).toBeGreaterThanOrEqual(0);
        expect(e.debtAfterCents).toBeGreaterThanOrEqual(0);
        expect(e.distributableCents).toBeGreaterThanOrEqual(0);
        expect(e.carryAfterCents).toBeGreaterThanOrEqual(0);
        expect(e.joaoShareCents + e.fernandaShareCents).toBe(e.distributableCents);
        expect(e.joaoReceivesCents + e.fernandaReceivesCents).toBe(e.distributableCents);
        if (e.kind !== "despesa") {
          expect(e.distributableCents).toBe(Math.max(0, e.profitCents) - e.compensatedCents);
        }
      }
    }
  });
});
