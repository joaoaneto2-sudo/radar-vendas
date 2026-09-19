import { describe, expect, it } from "vitest";
import { parseExpenseBody, parseInvoiceBody } from "../../lib/expenses";

describe("despesa da empresa", () => {
  it("aceita data, descrição e valor (vírgula ou ponto)", () => {
    expect(parseExpenseBody({ expense_date: "2026-09-12", description: " Anúncios ", category: "Marketing", amount: "150,50" })).toEqual({
      ok: true,
      date: "2026-09-12",
      description: "Anúncios",
      category: "Marketing",
      amount: 150.5,
      notes: null,
    });
  });

  it("recusa sem data, sem descrição e valor vazio, zero ou inválido", () => {
    expect(parseExpenseBody({ description: "x", amount: 10 })).toMatchObject({ ok: false, error: "missing_date" });
    expect(parseExpenseBody({ expense_date: "2026-09-12", description: "  ", amount: 10 })).toMatchObject({ ok: false, error: "missing_description" });
    for (const amount of ["", "0", "-5", "abc", null]) {
      expect(parseExpenseBody({ expense_date: "2026-09-12", description: "x", amount })).toMatchObject({ ok: false, error: "invalid_amount" });
    }
  });

  it("data que não existe é recusada", () => {
    expect(parseExpenseBody({ expense_date: "2026-02-31", description: "x", amount: 1 })).toMatchObject({ ok: false, error: "missing_date" });
  });
});

describe("fatura do cartão", () => {
  const BASE = { due_date: "2026-09-30", description: "Fatura de setembro" };

  it("fatura completa com as quatro partes", () => {
    const r = parseInvoiceBody({
      ...BASE,
      closing_date: "2026-09-22",
      total_amount: "12.000,00",
      status: "fechada",
      parts: [
        { nature: "pessoal_fernanda", amount: "1500" },
        { nature: "estoque_inicial", amount: "6000", description: "Joias de agosto" },
        { id: 7, nature: "reposicao", amount: "4000" },
        { nature: "despesa_empresa", amount: "500", description: "Anúncios" },
      ],
    });
    expect(r).toMatchObject({ ok: true, total: 12000, status: "fechada", closingDate: "2026-09-22" });
    expect(r.ok && r.parts.map((p) => [p.nature, p.amount, p.id])).toEqual([
      ["pessoal_fernanda", 1500, null],
      ["estoque_inicial", 6000, null],
      ["reposicao", 4000, 7],
      ["despesa_empresa", 500, null],
    ]);
  });

  it("enquanto a fatura não fecha, o total fica vazio (nulo, nunca zero) e o status acompanha", () => {
    const r = parseInvoiceBody({ ...BASE, total_amount: "" });
    expect(r).toMatchObject({ ok: true, total: null, status: "aguardando_fechamento", parts: [] });
    // dizer "fechada" sem total não vale
    expect(parseInvoiceBody({ ...BASE, total_amount: "", status: "fechada" })).toMatchObject({ status: "aguardando_fechamento" });
  });

  it("com total e sem status, fica fechada", () => {
    expect(parseInvoiceBody({ ...BASE, total_amount: "100" })).toMatchObject({ status: "fechada" });
  });

  it("paga: usa a data do pagamento, ou o vencimento se não vier", () => {
    expect(parseInvoiceBody({ ...BASE, total_amount: "100", status: "paga", paid_date: "2026-09-29" })).toMatchObject({ status: "paga", paidDate: "2026-09-29" });
    expect(parseInvoiceBody({ ...BASE, total_amount: "100", status: "paga" })).toMatchObject({ paidDate: "2026-09-30" });
    expect(parseInvoiceBody({ ...BASE, total_amount: "100", status: "fechada", paid_date: "2026-09-29" })).toMatchObject({ paidDate: null });
  });

  it("sem descrição usa um nome padrão; sem vencimento é recusada", () => {
    expect(parseInvoiceBody({ due_date: "2026-09-30" })).toMatchObject({ ok: true, description: "Fatura do cartão" });
    expect(parseInvoiceBody({ description: "x" })).toMatchObject({ ok: false, error: "missing_due_date" });
  });

  it("total inválido ou negativo é recusado", () => {
    expect(parseInvoiceBody({ ...BASE, total_amount: "abc" })).toMatchObject({ ok: false, error: "invalid_total" });
    expect(parseInvoiceBody({ ...BASE, total_amount: "-1" })).toMatchObject({ ok: false, error: "invalid_total" });
  });

  it("partes sem valor são ignoradas; valor inválido ou tipo desconhecido é recusado", () => {
    const r = parseInvoiceBody({ ...BASE, parts: [{ nature: "reposicao", amount: "" }, { nature: "reposicao", amount: "0" }, { nature: "reposicao", amount: "10" }] });
    expect(r.ok && r.parts).toHaveLength(1);
    expect(parseInvoiceBody({ ...BASE, parts: [{ nature: "reposicao", amount: "x" }] })).toMatchObject({ ok: false, error: "invalid_part_amount" });
    expect(parseInvoiceBody({ ...BASE, parts: [{ nature: "outra", amount: "10" }] })).toMatchObject({ ok: false, error: "invalid_nature" });
  });
});
