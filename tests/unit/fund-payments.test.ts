import { describe, expect, it } from "vitest";
import { validarPagamentoDoFundo, type CompraDoFundo } from "../../lib/fund-payments";

const HOJE = "2026-09-20";
const normal = (t: string) => t.replace(/\u00a0/g, " ");
const COMPRA: CompraDoFundo = { id: 7, kind: "reposicao", amountCents: 100000, paidCents: 30000 }; // R$ 1.000, já pagos R$ 300
const SALDO = 250000; // o fundo tem R$ 2.500 separados

describe("pagamento do fundo: o que vale", () => {
  it("aceita um pagamento normal e devolve o valor com duas casas", () => {
    const r = validarPagamentoDoFundo({ amount: "250,50", paid_date: "2026-09-18", notes: " parte 1 " }, COMPRA, SALDO, HOJE);
    expect(r).toEqual({ ok: true, value: { purchaseId: 7, amount: "250.50", paidDate: "2026-09-18", notes: "parte 1" }, avisos: [] });
  });

  it("sem data, usa hoje; sem observação, fica vazio", () => {
    const r = validarPagamentoDoFundo({ amount: 100 }, COMPRA, SALDO, HOJE);
    expect(r).toMatchObject({ ok: true, value: { paidDate: HOJE, notes: null, amount: "100.00" } });
  });

  it("pode pagar exatamente o que falta (R$ 700)", () => {
    expect(validarPagamentoDoFundo({ amount: "700" }, COMPRA, SALDO, HOJE)).toMatchObject({ ok: true });
  });
});

describe("pagamento do fundo: o que é recusado", () => {
  it("compra que não existe e estoque inicial", () => {
    expect(validarPagamentoDoFundo({ amount: "10" }, undefined, SALDO, HOJE)).toMatchObject({ ok: false, error: "purchase_not_found" });
    expect(validarPagamentoDoFundo({ amount: "10" }, { ...COMPRA, kind: "inicial" }, SALDO, HOJE)).toMatchObject({ ok: false, error: "only_replenishment" });
  });

  it("valor vazio, zero, negativo ou que não é número", () => {
    expect(validarPagamentoDoFundo({ amount: "" }, COMPRA, SALDO, HOJE)).toMatchObject({ ok: false, error: "missing_amount" });
    expect(validarPagamentoDoFundo({}, COMPRA, SALDO, HOJE)).toMatchObject({ ok: false, error: "missing_amount" });
    expect(validarPagamentoDoFundo({ amount: "0" }, COMPRA, SALDO, HOJE)).toMatchObject({ ok: false, error: "invalid_amount" });
    expect(validarPagamentoDoFundo({ amount: "-5" }, COMPRA, SALDO, HOJE)).toMatchObject({ ok: false, error: "invalid_amount" });
    expect(validarPagamentoDoFundo({ amount: "abc" }, COMPRA, SALDO, HOJE)).toMatchObject({ ok: false, error: "invalid_amount" });
  });

  it("valor acima do que falta pagar da compra", () => {
    const r = validarPagamentoDoFundo({ amount: "700,01" }, COMPRA, SALDO, HOJE);
    expect(r).toMatchObject({ ok: false, error: "over_remaining" });
    expect(!r.ok && normal(r.message)).toContain("R$ 700,00");
  });

  it("compra já quitada não aceita mais nada", () => {
    const quitada = { ...COMPRA, paidCents: COMPRA.amountCents };
    expect(validarPagamentoDoFundo({ amount: "1" }, quitada, SALDO, HOJE)).toMatchObject({ ok: false, error: "over_remaining" });
  });

  it("data inválida ou no futuro", () => {
    expect(validarPagamentoDoFundo({ amount: "10", paid_date: "2026-02-30" }, COMPRA, SALDO, HOJE)).toMatchObject({ ok: false, error: "invalid_date" });
    expect(validarPagamentoDoFundo({ amount: "10", paid_date: "hoje" }, COMPRA, SALDO, HOJE)).toMatchObject({ ok: false, error: "invalid_date" });
    expect(validarPagamentoDoFundo({ amount: "10", paid_date: "2026-09-21" }, COMPRA, SALDO, HOJE)).toMatchObject({ ok: false, error: "future_date" });
  });
});

describe("pagamento do fundo: aviso de saldo", () => {
  it("se o fundo não tem o valor separado, registra mas avisa", () => {
    const r = validarPagamentoDoFundo({ amount: "500" }, COMPRA, 20000, HOJE);
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.avisos).toHaveLength(1);
    expect(r.ok && normal(r.avisos[0])).toContain("R$ 200,00");
    expect(r.ok && normal(r.avisos[0])).toContain("-R$ 300,00");
  });

  it("saldo negativo mostra o fundo com zero separado", () => {
    const r = validarPagamentoDoFundo({ amount: "100" }, COMPRA, -5000, HOJE);
    expect(r.ok && normal(r.avisos[0])).toContain("R$ 0,00");
  });

  it("saldo exatamente igual ao pagamento não avisa", () => {
    const r = validarPagamentoDoFundo({ amount: "500" }, COMPRA, 50000, HOJE);
    expect(r.ok && r.avisos).toEqual([]);
  });
});
