import { describe, expect, it } from "vitest";
import { computeCardInvoice, type InvoiceInput, type InvoicePartInput } from "../../lib/finance/invoice";

const fatura = (parcial: Partial<InvoiceInput> = {}): InvoiceInput => ({
  id: 1,
  description: "Fatura do cartão da empresa (vence 30/09)",
  dueDate: "2026-09-30",
  totalCents: 1000000,
  status: "fechada",
  ...parcial,
});

const parte = (id: number, nature: InvoicePartInput["nature"], amountCents: number, invoiceId = 1): InvoicePartInput => ({
  id,
  invoiceId,
  nature,
  amountCents,
});

describe("fatura do cartão", () => {
  it("as 4 partes somam o total: fecha, e mostra quem paga cada parte", () => {
    const r = computeCardInvoice(fatura(), [
      parte(1, "pessoal_fernanda", 100000),
      parte(2, "estoque_inicial", 500000),
      parte(3, "reposicao", 300000),
      parte(4, "despesa_empresa", 100000),
    ]);
    expect(r.closes).toBe(true);
    expect(r.differenceCents).toBe(0);
    expect(r.partsTotalCents).toBe(1000000);
    expect(r.fernandaPaysCents).toBe(600000); // pessoal mais estoque inicial
    expect(r.fundPaysCents).toBe(300000);
    expect(r.companyExpenseCents).toBe(100000);
    expect(r.warnings).toHaveLength(0);
  });

  it("partes que não somam o total não fecham e avisam a diferença", () => {
    const r = computeCardInvoice(fatura(), [parte(1, "estoque_inicial", 500000), parte(2, "reposicao", 300000)]);
    expect(r.closes).toBe(false);
    expect(r.differenceCents).toBe(200000);
    expect(r.warnings[0].code).toBe("fatura_nao_fecha");
  });

  it("partes a mais também não fecham (diferença negativa)", () => {
    const r = computeCardInvoice(fatura(), [parte(1, "estoque_inicial", 1200000)]);
    expect(r.closes).toBe(false);
    expect(r.differenceCents).toBe(-200000);
  });

  it("fatura ainda aberta (sem total) não fecha, e o aviso explica", () => {
    const r = computeCardInvoice(fatura({ totalCents: null, status: "aguardando_fechamento" }), []);
    expect(r.closes).toBe(false);
    expect(r.differenceCents).toBeNull();
    expect(r.warnings[0].code).toBe("fatura_sem_total");
  });

  it("só conta as partes da própria fatura", () => {
    const r = computeCardInvoice(fatura({ totalCents: 100000 }), [
      parte(1, "reposicao", 100000, 1),
      parte(2, "reposicao", 999999, 2),
    ]);
    expect(r.closes).toBe(true);
    expect(r.partsTotalCents).toBe(100000);
  });
});
