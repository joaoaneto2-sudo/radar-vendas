import { describe, expect, it } from "vitest";
import { parseManufacturerBody } from "../../lib/manufacturers";

describe("dados do fabricante", () => {
  it("fabricante comum só precisa do nome (sem comissão, prazo padrão de 15 dias)", () => {
    expect(parseManufacturerBody({ name: "  Fabricante X  " })).toEqual({
      ok: true,
      name: "Fabricante X",
      represented: false,
      commissionPct: null,
      commissionDays: 15,
      wholesaleMode: "pronta_entrega",
    });
  });

  it("modalidade do atacado: pronta entrega é o padrão, aceita sob encomenda", () => {
    expect(parseManufacturerBody({ name: "A" })).toMatchObject({ wholesaleMode: "pronta_entrega" });
    expect(parseManufacturerBody({ name: "A", wholesale_mode: "encomenda" })).toMatchObject({
      wholesaleMode: "encomenda",
    });
    expect(parseManufacturerBody({ name: "A", wholesale_mode: "qualquer" })).toMatchObject({
      wholesaleMode: "pronta_entrega",
    });
  });

  it("fabricante representado guarda a comissão e o prazo (Bia Belutti: 20% e 15 dias)", () => {
    expect(
      parseManufacturerBody({ name: "Bia Belutti", represented: true, commission_pct: "20", commission_days: 15 })
    ).toEqual({
      ok: true,
      name: "Bia Belutti",
      represented: true,
      commissionPct: 20,
      commissionDays: 15,
      wholesaleMode: "pronta_entrega",
    });
  });

  it("aceita comissão com casas decimais e prazo diferente", () => {
    const r = parseManufacturerBody({ name: "Y", represented: true, commission_pct: 12.5, commission_days: 30 });
    expect(r).toMatchObject({ ok: true, commissionPct: 12.5, commissionDays: 30 });
  });

  it("se não é representado, ignora a comissão que vier junto", () => {
    const r = parseManufacturerBody({ name: "Z", represented: false, commission_pct: 20 });
    expect(r).toMatchObject({ ok: true, represented: false, commissionPct: null });
  });

  it("representado sem comissão não passa, com mensagem clara", () => {
    const r = parseManufacturerBody({ name: "Bia", represented: true, commission_pct: "" });
    expect(r).toMatchObject({ ok: false, error: "commission_required" });
  });

  it("recusa nome vazio, comissão fora de 0 a 100 e prazo absurdo", () => {
    expect(parseManufacturerBody({ name: "   " })).toMatchObject({ ok: false, error: "missing_name" });
    expect(parseManufacturerBody({ name: "A", represented: true, commission_pct: 101 })).toMatchObject({
      ok: false,
      error: "commission_range",
    });
    expect(parseManufacturerBody({ name: "A", represented: true, commission_pct: -1 })).toMatchObject({
      ok: false,
      error: "commission_range",
    });
    expect(parseManufacturerBody({ name: "A", commission_days: 4000 })).toMatchObject({
      ok: false,
      error: "days_range",
    });
  });
});
