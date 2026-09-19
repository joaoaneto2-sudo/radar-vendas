import { describe, expect, it } from "vitest";
import type { ReceiptInput, SaleInput } from "../../lib/finance/cascade";
import { computeWholesale } from "../../lib/finance/wholesale";

function atacado(parcial: Partial<SaleInput> & { id: number; amountCents: number }): SaleInput {
  return {
    date: "2026-09-12",
    costsCents: 0,
    tier: "atacado",
    status: "ativa",
    paymentMethod: null,
    payments: [],
    manufacturerId: 1,
    manufacturerName: "Bia Belutti",
    commissionPct: 20,
    commissionDays: 15,
    label: "Revendedora Ana",
    ...parcial,
  };
}

const pago = (id: number, manufacturerId: number, amountCents: number): ReceiptInput => ({
  id,
  kind: "comissao_fabricante",
  status: "recebida",
  receivedDate: "2026-09-17",
  expectedDate: null,
  amountCents,
  manufacturerId,
  manufacturerName: manufacturerId === 1 ? "Bia Belutti" : "Outra Marca",
});
const lembrete = (id: number, manufacturerId: number, amountCents: number, expectedDate: string): ReceiptInput => ({
  ...pago(id, manufacturerId, amountCents),
  status: "prevista",
  receivedDate: null,
  expectedDate,
});

describe("painel do atacado", () => {
  it("a comissão vence 15 dias depois de receber o estoque", () => {
    const r = computeWholesale([atacado({ id: 1, amountCents: 100000, stockReceivedDate: "2026-09-14" })], "2026-09-19");
    const item = r.manufacturers[0].items[0];
    expect(item.grossCents).toBe(100000);
    expect(item.commissionCents).toBe(20000);
    expect(item.dueDate).toBe("2026-09-29");
    expect(item.status).toBe("prevista");
    expect(r.commissionCents).toBe(20000);
    expect(r.pendingCents).toBe(20000);
  });

  it("sem a data do estoque, fica aguardando o estoque (sem data prevista)", () => {
    const r = computeWholesale([atacado({ id: 1, amountCents: 100000 })], "2026-09-19");
    const item = r.manufacturers[0].items[0];
    expect(item.dueDate).toBeNull();
    expect(item.status).toBe("aguardando_estoque");
  });

  it("passou da data prevista e não foi paga: atrasada", () => {
    const r = computeWholesale([atacado({ id: 1, amountCents: 100000, stockReceivedDate: "2026-08-01" })], "2026-09-19");
    expect(r.manufacturers[0].items[0].status).toBe("atrasada");
    expect(r.overdueCents).toBe(20000);
  });

  it("comissão recebida (lançada por fabricante) sai do que está pendente", () => {
    const r = computeWholesale(
      [atacado({ id: 1, amountCents: 100000, stockReceivedDate: "2026-09-01" })],
      "2026-09-19",
      [pago(1, 1, 20000)]
    );
    const item = r.manufacturers[0].items[0];
    expect(item.status).toBe("recebida");
    expect(item.receivedCents).toBe(20000);
    expect(r.receivedCents).toBe(20000);
    expect(r.pendingCents).toBe(0);
  });

  it("recebimento parcial mantém o resto pendente", () => {
    const r = computeWholesale(
      [atacado({ id: 1, amountCents: 100000, stockReceivedDate: "2026-09-14" })],
      "2026-09-19",
      [pago(1, 1, 8000)]
    );
    expect(r.receivedCents).toBe(8000);
    expect(r.pendingCents).toBe(12000);
    expect(r.manufacturers[0].items[0].status).toBe("prevista");
  });

  it("o que o fabricante paga abate as vendas mais antigas primeiro, sem ligar a uma venda só", () => {
    const r = computeWholesale(
      [
        atacado({ id: 1, amountCents: 100000, date: "2026-09-01" }), // comissão 200,00
        atacado({ id: 2, amountCents: 100000, date: "2026-09-05" }), // comissão 200,00
        atacado({ id: 3, amountCents: 100000, date: "2026-09-10" }), // comissão 200,00
      ],
      "2026-09-19",
      [pago(1, 1, 30000), pago(2, 1, 5000)] // 350,00 no total
    );
    const itens = r.manufacturers[0].items;
    expect(itens.map((i) => i.receivedCents)).toEqual([20000, 15000, 0]);
    expect(itens.map((i) => i.pendingCents)).toEqual([0, 5000, 20000]);
    expect(r.receivedCents).toBe(35000);
    expect(r.pendingCents).toBe(25000);
  });

  it("recebido a mais que a comissão das vendas lançadas aparece como excesso", () => {
    const r = computeWholesale([atacado({ id: 1, amountCents: 100000 })], "2026-09-19", [pago(1, 1, 25000)]);
    expect(r.receivedCents).toBe(20000);
    expect(r.excessCents).toBe(5000);
  });

  it("recebimento previsto (lembrete) com data lançada à mão vale mais que a data automática", () => {
    // Pela regra automática (estoque em 01/08 + 15 dias) estaria atrasada; o lembrete diz 30/09.
    const r = computeWholesale(
      [atacado({ id: 1, amountCents: 100000, stockReceivedDate: "2026-08-01" })],
      "2026-09-19",
      [lembrete(1, 1, 20000, "2026-09-30")]
    );
    const m = r.manufacturers[0];
    expect(m.items[0]).toMatchObject({ dueDate: "2026-09-30", status: "prevista" });
    expect(m.reminders).toHaveLength(1);
    expect(r.overdueCents).toBe(0);

    // Passou a data do lembrete: atrasada.
    expect(computeWholesale(
      [atacado({ id: 1, amountCents: 100000, stockReceivedDate: "2026-08-01" })],
      "2026-10-02",
      [lembrete(1, 1, 20000, "2026-09-30")]
    ).overdueCents).toBe(20000);
  });

  it("recebimento previsto sem data também tira a venda do \"aguardando estoque\"", () => {
    const r = computeWholesale([atacado({ id: 1, amountCents: 100000 })], "2026-09-19", [
      { ...lembrete(1, 1, 20000, "2026-10-10"), expectedDate: null },
    ]);
    expect(r.manufacturers[0].items[0].status).toBe("aguardando_estoque");
    expect(r.manufacturers[0].reminders[0].expectedDate).toBeNull();
  });

  it("fabricante que já pagou mas ainda não tem venda lançada aparece, com tudo como excesso", () => {
    const r = computeWholesale([], "2026-09-19", [pago(1, 7, 10000)]);
    expect(r.manufacturers).toHaveLength(1);
    expect(r.manufacturers[0]).toMatchObject({ manufacturerId: 7, salesCount: 0, receivedCents: 0, excessCents: 10000 });
  });

  it("aportes e outras receitas não mexem no painel do atacado", () => {
    const r = computeWholesale([atacado({ id: 1, amountCents: 100000 })], "2026-09-19", [
      { ...pago(1, 1, 5000), kind: "outra_receita" },
      { ...pago(2, 1, 5000), kind: "aporte_socio", partner: "joao" },
    ]);
    expect(r.receivedCents).toBe(0);
  });

  it("agrupa por fabricante, cada um com o seu percentual e prazo", () => {
    const r = computeWholesale(
      [
        atacado({ id: 1, amountCents: 100000, stockReceivedDate: "2026-09-14" }),
        atacado({ id: 2, amountCents: 50000, stockReceivedDate: "2026-09-14" }),
        atacado({
          id: 3,
          amountCents: 100000,
          manufacturerId: 2,
          manufacturerName: "Outra Marca",
          commissionPct: 10,
          commissionDays: 30,
          stockReceivedDate: "2026-09-14",
        }),
      ],
      "2026-09-19"
    );
    expect(r.manufacturers.map((f) => f.name)).toEqual(["Bia Belutti", "Outra Marca"]);
    expect(r.manufacturers[0]).toMatchObject({ salesCount: 2, grossCents: 150000, commissionCents: 30000, commissionPct: 20 });
    expect(r.manufacturers[1]).toMatchObject({ salesCount: 1, commissionCents: 10000, commissionPct: 10, commissionDays: 30 });
    expect(r.manufacturers[1].items[0].dueDate).toBe("2026-10-14");
    expect(r.commissionCents).toBe(40000);
  });

  it("ignora vendas canceladas, vendas que não são de atacado e vendas sem valor", () => {
    const r = computeWholesale(
      [
        atacado({ id: 1, amountCents: 100000, status: "cancelada" }),
        atacado({ id: 2, amountCents: 100000, tier: "varejo" }),
        atacado({ id: 3, amountCents: 0 }),
      ],
      "2026-09-19"
    );
    expect(r.manufacturers).toHaveLength(0);
    expect(r.commissionCents).toBe(0);
  });

  it("atacado sem fabricante representado é listado à parte", () => {
    const r = computeWholesale([atacado({ id: 9, amountCents: 100000, commissionPct: null })], "2026-09-19");
    expect(r.withoutManufacturerSaleIds).toEqual([9]);
    expect(r.commissionCents).toBe(0);
  });
});
