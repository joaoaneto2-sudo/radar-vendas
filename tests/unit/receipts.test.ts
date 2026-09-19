import { describe, expect, it } from "vitest";
import { lerValor, parseReceiptBody } from "../../lib/receipts";

describe("valor do recebimento", () => {
  it("aceita número, ponto e vírgula do jeito brasileiro", () => {
    expect(lerValor(1000)).toBe(1000);
    expect(lerValor("1000.50")).toBe(1000.5);
    expect(lerValor("1000,50")).toBe(1000.5);
    expect(lerValor("1.000,50")).toBe(1000.5);
    expect(lerValor(" 12 ")).toBe(12);
  });

  it("recusa vazio e texto", () => {
    expect(lerValor("")).toBeNull();
    expect(lerValor("abc")).toBeNull();
    expect(lerValor(undefined)).toBeNull();
    expect(lerValor(Number.NaN)).toBeNull();
  });
});

describe("dados do recebimento", () => {
  it("aporte do João: precisa de sócio, valor e data; nasce sempre como recebido", () => {
    const r = parseReceiptBody({
      kind: "aporte_socio",
      partner: "joao",
      amount: "1000",
      received_date: "2026-09-01",
      status: "prevista", // ignorado: aporte não é lembrete
      reason: " Pagamento inicial ",
    });
    expect(r).toMatchObject({
      ok: true,
      kind: "aporte_socio",
      status: "recebida",
      partner: "joao",
      amount: 1000,
      receivedDate: "2026-09-01",
      reason: "Pagamento inicial",
    });
  });

  it("aporte sem sócio não passa", () => {
    expect(parseReceiptBody({ kind: "aporte_socio", amount: 10, received_date: "2026-09-01" })).toMatchObject({
      ok: false,
      error: "missing_partner",
    });
  });

  it("comissão de fabricante: precisa do fabricante; guarda de quem veio e o apelido", () => {
    const r = parseReceiptBody({
      kind: "comissao_fabricante",
      manufacturer_id: "3",
      amount: "200,50",
      received_date: "2026-09-30",
      from_name: "Revendedora Ana",
      from_nickname: "Aninha",
      payment_method: "Pix",
    });
    expect(r).toMatchObject({
      ok: true,
      manufacturerId: 3,
      amount: 200.5,
      fromName: "Revendedora Ana",
      fromNickname: "Aninha",
      paymentMethod: "Pix",
    });
    expect(
      parseReceiptBody({ kind: "comissao_fabricante", amount: 10, received_date: "2026-09-30" })
    ).toMatchObject({ ok: false, error: "missing_manufacturer" });
  });

  it("recebimento previsto (lembrete): data prevista é opcional e não exige data de recebimento", () => {
    const comData = parseReceiptBody({
      kind: "comissao_fabricante",
      status: "prevista",
      manufacturer_id: 1,
      amount: 500,
      expected_date: "2026-10-10",
    });
    expect(comData).toMatchObject({ ok: true, status: "prevista", expectedDate: "2026-10-10", receivedDate: null });

    const semData = parseReceiptBody({ kind: "outra_receita", status: "prevista", amount: 500 });
    expect(semData).toMatchObject({ ok: true, status: "prevista", expectedDate: null, receivedDate: null });
  });

  it("recebido sem data do recebimento não passa", () => {
    expect(parseReceiptBody({ kind: "outra_receita", amount: 50 })).toMatchObject({
      ok: false,
      error: "missing_received_date",
    });
    expect(parseReceiptBody({ kind: "outra_receita", amount: 50, received_date: "2026-02-31" })).toMatchObject({
      ok: false,
      error: "missing_received_date", // 31 de fevereiro não existe
    });
  });

  it("valor precisa ser maior que zero", () => {
    for (const amount of [0, -5, "", "x"]) {
      expect(parseReceiptBody({ kind: "outra_receita", amount, received_date: "2026-09-01" })).toMatchObject({
        ok: false,
        error: "invalid_amount",
      });
    }
  });

  it("parcela de venda: precisa escolher a parcela e a data; o valor é o da parcela", () => {
    expect(parseReceiptBody({ kind: "parcela_venda", received_date: "2026-09-19" })).toMatchObject({
      ok: false,
      error: "missing_payment",
    });
    const r = parseReceiptBody({ kind: "parcela_venda", payment_id: 12, received_date: "2026-09-19" });
    expect(r).toMatchObject({ ok: true, kind: "parcela_venda", paymentId: 12, amount: null, status: "recebida" });
  });

  it("tipo desconhecido é recusado, e campos que não servem para o tipo são descartados", () => {
    expect(parseReceiptBody({ kind: "venda", amount: 10 })).toMatchObject({ ok: false, error: "invalid_kind" });
    const r = parseReceiptBody({
      kind: "outra_receita",
      amount: 10,
      received_date: "2026-09-01",
      partner: "joao",
      manufacturer_id: 5,
    });
    expect(r).toMatchObject({ ok: true, partner: null, manufacturerId: null });
  });
});
