import { describe, expect, it } from "vitest";
import { computeFund, computeLiabilities, type PurchaseInput } from "../../lib/finance/accounts";
import { ESPERADO } from "../fixtures";

const COMPRAS: PurchaseInput[] = [
  { id: 1, kind: "inicial", amountCents: 1500000, date: null, description: "Estoque inicial" },
  { id: 2, kind: "reposicao", amountCents: 230200, date: "2026-09-01", description: "Reposição CD" },
  { id: 3, kind: "reposicao", amountCents: 301800, date: "2026-09-03", description: "Reposição SM" },
];

describe("fundo de reposição (números do briefing)", () => {
  it("entrou 1.886,39, reposições a pagar 5.320,00, saldo do fundo menos a pagar -3.433,61", () => {
    const f = computeFund(ESPERADO.reposicao, COMPRAS, []);
    expect(f.enteredCents).toBe(188639);
    expect(f.paidCents).toBe(0);
    expect(f.balanceCents).toBe(188639);
    expect(f.purchasesTotalCents).toBe(532000);
    expect(f.payableCents).toBe(ESPERADO.reposicoesAPagar);
    expect(f.balanceMinusPayableCents).toBe(ESPERADO.fundoMenosAPagar);
    expect(f.initialStockCents).toBe(1500000);
    expect(f.totalStockBoughtCents).toBe(2032000); // 20.320,00
  });

  it("pagamento do fundo reduz o que falta pagar e o saldo do fundo", () => {
    const f = computeFund(188639, COMPRAS, [{ id: 1, purchaseId: 2, amountCents: 100000, date: "2026-09-15" }]);
    expect(f.paidCents).toBe(100000);
    expect(f.balanceCents).toBe(88639);
    expect(f.payableCents).toBe(432000);
    expect(f.perPurchase.find((c) => c.purchaseId === 2)?.remainingCents).toBe(130200);
  });

  it("o fundo só paga reposição: pagamento ligado ao estoque inicial é ignorado e avisa", () => {
    const f = computeFund(188639, COMPRAS, [{ id: 1, purchaseId: 1, amountCents: 50000, date: "2026-09-15" }]);
    expect(f.paidCents).toBe(0);
    expect(f.warnings.some((w) => w.code === "pagamento_de_fundo_em_estoque_inicial")).toBe(true);
  });

  it("pagamento ligado a uma compra que não existe é ignorado e avisa", () => {
    const f = computeFund(188639, COMPRAS, [{ id: 1, purchaseId: 99, amountCents: 50000, date: "2026-09-15" }]);
    expect(f.paidCents).toBe(0);
    expect(f.warnings.some((w) => w.code === "pagamento_de_fundo_sem_compra")).toBe(true);
  });

  it("avisa quando uma compra recebe mais pagamentos do que o valor dela", () => {
    const f = computeFund(0, COMPRAS, [{ id: 1, purchaseId: 2, amountCents: 999999, date: "2026-09-15" }]);
    expect(f.warnings.some((w) => w.code === "compra_paga_a_mais")).toBe(true);
  });
});

describe("passivo da empresa", () => {
  const passivo = [{ id: 1, description: "Passivo da empresa", responsible: "Fernanda", totalCents: 3000000, dueDate: null }];

  it("R$ 30.000, pago 0, saldo 30.000", () => {
    const r = computeLiabilities(passivo, []);
    expect(r.totalCents).toBe(3000000);
    expect(r.paidCents).toBe(0);
    expect(r.balanceCents).toBe(3000000);
  });

  it("pagamentos reduzem o saldo da conta certa", () => {
    const r = computeLiabilities(passivo, [{ id: 1, liabilityId: 1, amountCents: 500000, date: "2026-09-20" }]);
    expect(r.paidCents).toBe(500000);
    expect(r.balanceCents).toBe(2500000);
    expect(r.items[0].balanceCents).toBe(2500000);
  });

  it("pagamento de conta que não existe é ignorado e avisa", () => {
    const r = computeLiabilities(passivo, [{ id: 1, liabilityId: 42, amountCents: 100, date: "2026-09-20" }]);
    expect(r.paidCents).toBe(0);
    expect(r.warnings).toHaveLength(1);
  });
});
