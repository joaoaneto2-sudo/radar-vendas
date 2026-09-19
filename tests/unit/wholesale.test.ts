import { describe, expect, it } from "vitest";
import type { SaleInput } from "../../lib/finance/cascade";
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

  it("comissão recebida sai do que está pendente", () => {
    const r = computeWholesale(
      [
        atacado({
          id: 1,
          amountCents: 100000,
          stockReceivedDate: "2026-09-01",
          payments: [{ id: 5, dueDate: "2026-09-16", amountCents: 20000, status: "recebida", receivedDate: "2026-09-17" }],
        }),
      ],
      "2026-09-19"
    );
    const item = r.manufacturers[0].items[0];
    expect(item.status).toBe("recebida");
    expect(item.receivedCents).toBe(20000);
    expect(r.receivedCents).toBe(20000);
    expect(r.pendingCents).toBe(0);
  });

  it("recebimento parcial mantém o resto pendente", () => {
    const r = computeWholesale(
      [
        atacado({
          id: 1,
          amountCents: 100000,
          payments: [
            { id: 1, dueDate: "2026-09-16", amountCents: 8000, status: "recebida", receivedDate: "2026-09-16" },
            { id: 2, dueDate: "2026-10-16", amountCents: 12000, status: "prevista", receivedDate: null },
          ],
        }),
      ],
      "2026-09-19"
    );
    expect(r.receivedCents).toBe(8000);
    expect(r.pendingCents).toBe(12000);
    expect(r.manufacturers[0].items[0].dueDate).toBe("2026-10-16");
    expect(r.manufacturers[0].items[0].status).toBe("prevista");
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
