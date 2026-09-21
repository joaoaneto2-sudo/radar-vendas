import { describe, expect, it } from "vitest";
import { dividaDoJoao, podeDesfazer, textoDaMudanca, validarAcordo, type AcordoValores } from "../../lib/agreement";

const normal = (t: string) => t.replace(/ /g, " ");

const ATUAL: AcordoValores = {
  partnershipStart: "2026-09-01",
  retailPct: 30,
  wholesalePct: 0,
  consignmentPct: 30,
  joaoSharePct: 50,
  initialStockCents: 1500000,
};

describe("conferir uma mudança do acordo", () => {
  it("troca só o que veio e lista o que mudou", () => {
    const r = validarAcordo({ retail_replenish_pct: "25", initial_stock_value: "12.345,60" }, ATUAL);
    expect(r).toMatchObject({ ok: true, valores: { retailPct: 25, initialStockCents: 1234560, consignmentPct: 30, joaoSharePct: 50 } });
    expect(r.ok && r.mudancas).toEqual([
      { campo: "retailPct", antes: 30, depois: 25 },
      { campo: "initialStockCents", antes: 1500000, depois: 1234560 },
    ]);
  });

  it("aceita vírgula e ponto nas porcentagens, com até duas casas", () => {
    expect(validarAcordo({ joao_share_pct: "47,5" }, ATUAL)).toMatchObject({ ok: true, valores: { joaoSharePct: 47.5 } });
    expect(validarAcordo({ joao_share_pct: 47.5 }, ATUAL)).toMatchObject({ ok: true, valores: { joaoSharePct: 47.5 } });
  });

  it("muda o início da sociedade", () => {
    const r = validarAcordo({ partnership_start: "2026-08-15" }, ATUAL);
    expect(r).toMatchObject({ ok: true, valores: { partnershipStart: "2026-08-15" } });
  });

  it("sem nenhuma mudança, recusa", () => {
    expect(validarAcordo({}, ATUAL)).toMatchObject({ ok: false, error: "no_changes" });
    expect(validarAcordo({ retail_replenish_pct: "30", initial_stock_value: "15000" }, ATUAL)).toMatchObject({ ok: false, error: "no_changes" });
  });

  it("recusa porcentagem vazia, fora de 0 a 100 ou que não é número", () => {
    expect(validarAcordo({ retail_replenish_pct: "" }, ATUAL)).toMatchObject({ ok: false, error: "missing_value" });
    expect(validarAcordo({ retail_replenish_pct: "101" }, ATUAL)).toMatchObject({ ok: false, error: "out_of_range" });
    expect(validarAcordo({ retail_replenish_pct: "-1" }, ATUAL)).toMatchObject({ ok: false, error: "out_of_range" });
    expect(validarAcordo({ retail_replenish_pct: "abc" }, ATUAL)).toMatchObject({ ok: false, error: "invalid_value" });
  });

  it("aceita 0 e 100", () => {
    expect(validarAcordo({ wholesale_replenish_pct: "0" }, { ...ATUAL, wholesalePct: 10 })).toMatchObject({ ok: true });
    expect(validarAcordo({ joao_share_pct: "100" }, ATUAL)).toMatchObject({ ok: true });
  });

  it("recusa estoque inicial vazio, negativo ou inválido; aceita zero", () => {
    expect(validarAcordo({ initial_stock_value: "" }, ATUAL)).toMatchObject({ ok: false, error: "missing_value" });
    expect(validarAcordo({ initial_stock_value: "-10" }, ATUAL)).toMatchObject({ ok: false, error: "negative_value" });
    expect(validarAcordo({ initial_stock_value: "x" }, ATUAL)).toMatchObject({ ok: false, error: "invalid_value" });
    expect(validarAcordo({ initial_stock_value: "0" }, ATUAL)).toMatchObject({ ok: true, valores: { initialStockCents: 0 } });
  });

  it("recusa data inválida", () => {
    expect(validarAcordo({ partnership_start: "2026-02-30" }, ATUAL)).toMatchObject({ ok: false, error: "invalid_date" });
    expect(validarAcordo({ partnership_start: "01/09/2026" }, ATUAL)).toMatchObject({ ok: false, error: "invalid_date" });
    expect(validarAcordo({ partnership_start: "" }, ATUAL)).toMatchObject({ ok: false, error: "invalid_date" });
  });
});

describe("dívida e textos", () => {
  it("a dívida é a parte do João do estoque inicial", () => {
    expect(dividaDoJoao(1500000, 50)).toBe(750000);
    expect(dividaDoJoao(1000001, 50)).toBe(500001); // arredonda para o centavo mais próximo
    expect(dividaDoJoao(0, 50)).toBe(0);
  });

  it("texto de cada mudança, em português", () => {
    expect(textoDaMudanca({ campo: "retailPct", antes: 30, depois: 27.5 })).toBe("Reposição do varejo: 30% para 27,5%");
    expect(normal(textoDaMudanca({ campo: "initialStockCents", antes: 1500000, depois: 1234560 }))).toBe(
      "Estoque inicial: R$ 15.000,00 para R$ 12.345,60"
    );
    expect(textoDaMudanca({ campo: "partnershipStart", antes: "2026-09-01", depois: "2026-08-15" })).toBe(
      "Início da sociedade: 01/09/2026 para 15/08/2026"
    );
  });
});

describe("desfazer", () => {
  const MUDANCAS = [{ campo: "retailPct" as const, antes: 30, depois: 25 }];

  it("só desfaz se os valores de hoje ainda são os que a mudança deixou", () => {
    expect(podeDesfazer({ ...ATUAL, retailPct: 25 }, MUDANCAS)).toBe(true);
    expect(podeDesfazer({ ...ATUAL, retailPct: 20 }, MUDANCAS)).toBe(false); // alguém mudou de novo depois
    expect(podeDesfazer(ATUAL, [])).toBe(false);
  });
});
