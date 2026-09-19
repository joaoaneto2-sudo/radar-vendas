import { describe, expect, it } from "vitest";
import { productPurchaseTotals, purchasePhase } from "../../lib/finance/purchases";

const INICIO = "2026-09-01";

describe("fase da compra, pela data", () => {
  it("antes de 01/09 é estoque inicial; a partir de 01/09, inclusive, é posterior", () => {
    expect(purchasePhase("2026-08-31", INICIO)).toBe("inicial");
    expect(purchasePhase("2026-09-01", INICIO)).toBe("posterior");
    expect(purchasePhase("2026-09-19", INICIO)).toBe("posterior");
    expect(purchasePhase("2025-01-10", INICIO)).toBe("inicial");
  });

  it("sem data, fica sem fase", () => {
    expect(purchasePhase(null, INICIO)).toBe("sem_data");
    expect(purchasePhase(undefined, INICIO)).toBe("sem_data");
    expect(purchasePhase("", INICIO)).toBe("sem_data");
  });

  it("aceita a data com hora (como vinha antes) e usa só o dia", () => {
    expect(purchasePhase("2026-08-31T23:00:00.000Z", INICIO)).toBe("inicial");
  });
});

describe("totais das compras cadastradas nas peças", () => {
  it("soma custo x quantidade em cada fase e conta o que falta preencher", () => {
    const r = productPurchaseTotals(
      [
        { cost: "100.00", purchase_qty: 5, purchase_date: "2026-08-10" }, // inicial: 500,00
        { cost: 80, purchase_qty: 3, purchase_date: "2026-08-31" }, // inicial: 240,00
        { cost: "30.50", purchase_qty: 10, purchase_date: "2026-09-01" }, // posterior: 305,00
        { cost: "40.00", purchase_qty: 2, purchase_date: null }, // sem data
        { cost: null, purchase_qty: 4, purchase_date: "2026-08-15" }, // sem custo: conta zero
        { cost: "20.00", purchase_qty: null, purchase_date: "2026-09-05" }, // sem quantidade: conta zero
      ],
      INICIO
    );

    expect(r.initial).toEqual({ cents: 74000, pieces: 12, products: 3 });
    expect(r.posterior).toEqual({ cents: 30500, pieces: 10, products: 2 });
    expect(r.undatedProducts).toBe(1);
    expect(r.withoutCostProducts).toBe(1);
    expect(r.withoutQtyProducts).toBe(1);
  });

  it("peça de atacado (do fabricante) fica fora do estoque comprado", () => {
    const r = productPurchaseTotals(
      [
        { cost: "100.00", purchase_qty: 5, purchase_date: "2026-08-10", sale_channel: "varejo" },
        { cost: "50.00", purchase_qty: 20, purchase_date: "2026-08-10", sale_channel: "atacado" },
        { cost: "50.00", purchase_qty: 1, purchase_date: null, sale_channel: "atacado" },
      ],
      INICIO
    );
    expect(r.initial).toEqual({ cents: 50000, pieces: 5, products: 1 });
    expect(r.undatedProducts).toBe(0);
  });

  it("lista vazia dá tudo zerado", () => {
    const r = productPurchaseTotals([], INICIO);
    expect(r.initial.cents).toBe(0);
    expect(r.posterior.cents).toBe(0);
    expect(r.undatedProducts).toBe(0);
  });

  it("não tem erro de centavos com valores quebrados", () => {
    const r = productPurchaseTotals([{ cost: "0.10", purchase_qty: 3, purchase_date: "2026-08-01" }], INICIO);
    expect(r.initial.cents).toBe(30);
  });
});
