import { describe, expect, it } from "vitest";
import { parseExpenseBody } from "../../lib/expenses";

const BASE = { expense_date: "2026-09-12", description: "Contador", amount: "150" };

describe("despesa com fundo", () => {
  it("sem fundo é nulo (como sempre foi)", () => {
    expect(parseExpenseBody(BASE)).toMatchObject({ ok: true, fundId: null });
    expect(parseExpenseBody({ ...BASE, fund_id: "" })).toMatchObject({ ok: true, fundId: null });
    expect(parseExpenseBody({ ...BASE, fund_id: null })).toMatchObject({ ok: true, fundId: null });
  });

  it("aceita o número do fundo, como texto ou número", () => {
    expect(parseExpenseBody({ ...BASE, fund_id: 3 })).toMatchObject({ ok: true, fundId: 3 });
    expect(parseExpenseBody({ ...BASE, fund_id: "3" })).toMatchObject({ ok: true, fundId: 3 });
  });

  it("recusa fundo que não é um número inteiro maior que zero", () => {
    for (const ruim of ["abc", "0", "-2", "1.5", {}]) {
      expect(parseExpenseBody({ ...BASE, fund_id: ruim })).toMatchObject({ ok: false, error: "invalid_fund" });
    }
  });
});
