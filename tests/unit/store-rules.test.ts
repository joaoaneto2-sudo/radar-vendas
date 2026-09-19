import { describe, expect, it } from "vitest";
import { WHOLESALE_BLOCK_MESSAGE, parseStoreSettings, readMoneyOrNull, resolveStoreFields, type StoreState } from "../../lib/store-rules";

const FORA: StoreState = { show_online: false, featured: false, sale_price: null, public_description: null };
const NO_SITE: StoreState = { show_online: true, featured: false, sale_price: null, public_description: null };
const VAREJO = { saleChannel: "varejo", price: 200 };

describe("valor vazio é 'sem valor', nunca zero", () => {
  it("vazio, espaços e nulo viram null", () => {
    expect(readMoneyOrNull("")).toBeNull();
    expect(readMoneyOrNull("   ")).toBeNull();
    expect(readMoneyOrNull(null)).toBeNull();
    expect(readMoneyOrNull(undefined)).toBeNull();
  });

  it("aceita ponto, vírgula e milhar do jeito brasileiro", () => {
    expect(readMoneyOrNull("150")).toBe(150);
    expect(readMoneyOrNull("149,90")).toBe(149.9);
    expect(readMoneyOrNull("1.149,90")).toBe(1149.9);
    expect(readMoneyOrNull(99.5)).toBe(99.5);
  });

  it("lixo é inválido, não zero", () => {
    expect(readMoneyOrNull("abc")).toBe("invalido");
    expect(readMoneyOrNull("12x")).toBe("invalido");
    expect(readMoneyOrNull({})).toBe("invalido");
  });
});

describe("No site e Carrossel", () => {
  it("liga e desliga o site", () => {
    const r = resolveStoreFields({ show_online: true }, FORA, VAREJO);
    expect(r).toMatchObject({ ok: true, value: { show_online: true, featured: false } });
  });

  it("carrossel só liga com o site ligado", () => {
    expect(resolveStoreFields({ featured: true }, FORA, VAREJO)).toMatchObject({ ok: false, error: "featured_needs_online" });
    expect(resolveStoreFields({ featured: true }, NO_SITE, VAREJO)).toMatchObject({ ok: true, value: { featured: true } });
    // ligando os dois juntos, vale
    expect(resolveStoreFields({ show_online: true, featured: true }, FORA, VAREJO)).toMatchObject({
      ok: true,
      value: { show_online: true, featured: true },
    });
  });

  it("desligar o site desliga o carrossel junto", () => {
    const r = resolveStoreFields({ show_online: false }, { ...NO_SITE, featured: true }, VAREJO);
    expect(r).toMatchObject({ ok: true, value: { show_online: false, featured: false } });
    expect(r.ok && r.notes.length).toBe(1);
  });

  it("desligar os dois de uma vez também funciona", () => {
    const r = resolveStoreFields({ show_online: false, featured: false }, { ...NO_SITE, featured: true }, VAREJO);
    expect(r).toMatchObject({ ok: true, value: { show_online: false, featured: false } });
  });

  it("chaves que não vieram mantêm o que a peça já tem", () => {
    const r = resolveStoreFields({}, { show_online: true, featured: true, sale_price: 150, public_description: "Lindo" }, VAREJO);
    expect(r).toMatchObject({ ok: true, value: { show_online: true, featured: true, sale_price: 150, public_description: "Lindo" } });
  });
});

describe("peça de atacado (do fabricante)", () => {
  it("não vai para o site", () => {
    const r = resolveStoreFields({ show_online: true }, FORA, { saleChannel: "atacado", price: 200 });
    expect(r).toEqual({ ok: false, error: "wholesale_not_allowed", message: WHOLESALE_BLOCK_MESSAGE });
  });

  it("nem vira atacado com o site ligado", () => {
    expect(resolveStoreFields({}, NO_SITE, { saleChannel: "atacado", price: 200 })).toMatchObject({
      ok: false,
      error: "wholesale_not_allowed",
    });
  });

  it("atacado fora do site salva normalmente", () => {
    expect(resolveStoreFields({ public_description: "x" }, FORA, { saleChannel: "atacado", price: 200 })).toMatchObject({ ok: true });
  });
});

describe("preço promocional", () => {
  it("precisa ser menor que o preço normal", () => {
    expect(resolveStoreFields({ sale_price: "150" }, FORA, VAREJO)).toMatchObject({ ok: true, value: { sale_price: 150 } });
    expect(resolveStoreFields({ sale_price: "199,99" }, FORA, VAREJO)).toMatchObject({ ok: true, value: { sale_price: 199.99 } });
    expect(resolveStoreFields({ sale_price: "200" }, FORA, VAREJO)).toMatchObject({ ok: false, error: "sale_price_not_lower" });
    expect(resolveStoreFields({ sale_price: "250" }, FORA, VAREJO)).toMatchObject({ ok: false, error: "sale_price_not_lower" });
  });

  it("vazio tira a promoção (fica sem valor, não zero)", () => {
    const r = resolveStoreFields({ sale_price: "" }, { ...FORA, sale_price: 150 }, VAREJO);
    expect(r).toMatchObject({ ok: true, value: { sale_price: null } });
  });

  it("zero é recusado (não é 'sem promoção')", () => {
    expect(resolveStoreFields({ sale_price: "0" }, FORA, VAREJO)).toMatchObject({ ok: false, error: "invalid_sale_price" });
    expect(resolveStoreFields({ sale_price: "-5" }, FORA, VAREJO)).toMatchObject({ ok: false, error: "invalid_sale_price" });
    expect(resolveStoreFields({ sale_price: "abc" }, FORA, VAREJO)).toMatchObject({ ok: false, error: "invalid_sale_price" });
  });

  it("sem preço normal não dá para ter promoção", () => {
    expect(resolveStoreFields({ sale_price: "50" }, FORA, { saleChannel: "varejo", price: null })).toMatchObject({
      ok: false,
      error: "sale_price_needs_price",
    });
  });

  it("subir o preço promocional que já existe acima de um novo preço normal é recusado", () => {
    // A peça tinha promoção de 150; o preço normal foi baixado para 140.
    expect(resolveStoreFields({}, { ...FORA, sale_price: 150 }, { saleChannel: "varejo", price: 140 })).toMatchObject({
      ok: false,
      error: "sale_price_not_lower",
    });
  });
});

describe("descrição para o cliente", () => {
  it("guarda sem espaços nas pontas; vazio vira nulo", () => {
    expect(resolveStoreFields({ public_description: "  Anel lindo  " }, FORA, VAREJO)).toMatchObject({
      value: { public_description: "Anel lindo" },
    });
    expect(resolveStoreFields({ public_description: "   " }, { ...FORA, public_description: "x" }, VAREJO)).toMatchObject({
      value: { public_description: null },
    });
  });
});

describe("ajustes da loja", () => {
  const BOM = { delivery_salvador: "15", shipping_correios: "32,90", installment_fee: "10", max_installments: "12" };

  it("valores completos", () => {
    expect(parseStoreSettings(BOM)).toEqual({
      ok: true,
      value: { delivery_salvador: 15, shipping_correios: 32.9, installment_fee: 10, max_installments: 12 },
    });
  });

  it("entrega e Correios em branco ficam 'ainda não definido' (nulo, não zero)", () => {
    const r = parseStoreSettings({ ...BOM, delivery_salvador: "", shipping_correios: null });
    expect(r).toMatchObject({ ok: true, value: { delivery_salvador: null, shipping_correios: null } });
  });

  it("entrega grátis é 0 de propósito (diferente de vazio)", () => {
    expect(parseStoreSettings({ ...BOM, delivery_salvador: "0" })).toMatchObject({ ok: true, value: { delivery_salvador: 0 } });
  });

  it("recusa valor negativo ou inválido", () => {
    expect(parseStoreSettings({ ...BOM, delivery_salvador: "-1" })).toMatchObject({ ok: false, error: "invalid_delivery_salvador" });
    expect(parseStoreSettings({ ...BOM, shipping_correios: "xx" })).toMatchObject({ ok: false, error: "invalid_shipping_correios" });
  });

  it("acréscimo por parcela é obrigatório (pode ser 0) e o máximo é de 1 a 24", () => {
    expect(parseStoreSettings({ ...BOM, installment_fee: "" })).toMatchObject({ ok: false, error: "invalid_installment_fee" });
    expect(parseStoreSettings({ ...BOM, installment_fee: "0" })).toMatchObject({ ok: true, value: { installment_fee: 0 } });
    for (const ruim of ["", "0", "25", "2,5", "abc"]) {
      expect(parseStoreSettings({ ...BOM, max_installments: ruim })).toMatchObject({ ok: false, error: "invalid_max_installments" });
    }
    expect(parseStoreSettings({ ...BOM, max_installments: 6 })).toMatchObject({ ok: true, value: { max_installments: 6 } });
  });
});
