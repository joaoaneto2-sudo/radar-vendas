import { describe, expect, it } from "vitest";
import {
  WHOLESALE_BLOCK_MESSAGE,
  faltaParaPublicar,
  mensagemDeFalta,
  parseStoreSettings,
  readMoneyOrNull,
  resolveStoreFields,
  rowsToSettings,
  settingsToRows,
  type StoreState,
} from "../../lib/store-rules";

const TEXTO = "Solitário delicado com zircônia.";
const FORA: StoreState = { show_online: false, featured: false, sale_price: null, public_description: null };
const PRONTA_FORA: StoreState = { ...FORA, public_description: TEXTO };
const NO_SITE: StoreState = { show_online: true, featured: false, sale_price: null, public_description: TEXTO };
const VAREJO = { saleChannel: "varejo", price: 200, photoUrl: "https://x/a.jpg" };

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
    const r = resolveStoreFields({ show_online: true }, PRONTA_FORA, VAREJO);
    expect(r).toMatchObject({ ok: true, value: { show_online: true, featured: false } });
  });

  it("carrossel só liga com o site ligado", () => {
    expect(resolveStoreFields({ featured: true }, FORA, VAREJO)).toMatchObject({ ok: false, error: "featured_needs_online" });
    expect(resolveStoreFields({ featured: true }, NO_SITE, VAREJO)).toMatchObject({ ok: true, value: { featured: true } });
    // ligando os dois juntos, vale
    expect(resolveStoreFields({ show_online: true, featured: true }, PRONTA_FORA, VAREJO)).toMatchObject({
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
    const r = resolveStoreFields({ show_online: true }, FORA, { saleChannel: "atacado", price: 200, photoUrl: "https://x/a.jpg" });
    expect(r).toEqual({ ok: false, error: "wholesale_not_allowed", message: WHOLESALE_BLOCK_MESSAGE });
  });

  it("nem vira atacado com o site ligado", () => {
    expect(resolveStoreFields({}, NO_SITE, { saleChannel: "atacado", price: 200, photoUrl: "https://x/a.jpg" })).toMatchObject({
      ok: false,
      error: "wholesale_not_allowed",
    });
  });

  it("atacado fora do site salva normalmente", () => {
    expect(resolveStoreFields({ public_description: "x" }, FORA, { saleChannel: "atacado", price: 200, photoUrl: null })).toMatchObject({ ok: true });
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
    expect(resolveStoreFields({ sale_price: "50" }, FORA, { saleChannel: "varejo", price: null, photoUrl: null })).toMatchObject({
      ok: false,
      error: "sale_price_needs_price",
    });
  });

  it("subir o preço promocional que já existe acima de um novo preço normal é recusado", () => {
    // A peça tinha promoção de 150; o preço normal foi baixado para 140.
    expect(resolveStoreFields({}, { ...FORA, sale_price: 150 }, { saleChannel: "varejo", price: 140, photoUrl: null })).toMatchObject({
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

  it("acréscimo por parcela e máximo em branco valem 'a loja usa o padrão' (nulo, nunca zero)", () => {
    expect(parseStoreSettings({ ...BOM, installment_fee: "", max_installments: "" })).toMatchObject({
      ok: true,
      value: { installment_fee: null, max_installments: null },
    });
    // zero de propósito continua sendo zero
    expect(parseStoreSettings({ ...BOM, installment_fee: "0" })).toMatchObject({ ok: true, value: { installment_fee: 0 } });
  });

  it("acréscimo inválido ou negativo e máximo fora de 1 a 24 são recusados", () => {
    expect(parseStoreSettings({ ...BOM, installment_fee: "abc" })).toMatchObject({ ok: false, error: "invalid_installment_fee" });
    expect(parseStoreSettings({ ...BOM, installment_fee: "-1" })).toMatchObject({ ok: false, error: "invalid_installment_fee" });
    for (const ruim of ["0", "25", "2,5", "abc"]) {
      expect(parseStoreSettings({ ...BOM, max_installments: ruim })).toMatchObject({ ok: false, error: "invalid_max_installments" });
    }
    expect(parseStoreSettings({ ...BOM, max_installments: 6 })).toMatchObject({ ok: true, value: { max_installments: 6 } });
  });
});

describe("ajustes da loja: ida e volta para chave e valor", () => {
  it("vira texto no formato da loja: dinheiro com 2 casas e parcelas inteiras", () => {
    expect(
      settingsToRows({ delivery_salvador: 15, shipping_correios: 25.5, installment_fee: 10, max_installments: 12 })
    ).toEqual([
      { key: "entrega_salvador", value: "15.00" },
      { key: "correios", value: "25.50" },
      { key: "acrescimo_parcela", value: "10.00" },
      { key: "max_parcelas", value: "12" },
    ]);
  });

  it("valor em branco vira nulo (a chave será apagada), zero continua zero", () => {
    const linhas = settingsToRows({ delivery_salvador: null, shipping_correios: 0, installment_fee: null, max_installments: null });
    expect(linhas).toEqual([
      { key: "entrega_salvador", value: null },
      { key: "correios", value: "0.00" },
      { key: "acrescimo_parcela", value: null },
      { key: "max_parcelas", value: null },
    ]);
  });

  it("lê de volta; chave ausente ou valor estranho vira vazio", () => {
    expect(
      rowsToSettings([
        { key: "entrega_salvador", value: "15.00" },
        { key: "correios", value: "" },
        { key: "acrescimo_parcela", value: "abc" },
        { key: "max_parcelas", value: "12" },
      ])
    ).toEqual({ delivery_salvador: 15, shipping_correios: null, installment_fee: null, max_installments: 12 });
    expect(rowsToSettings([])).toEqual({ delivery_salvador: null, shipping_correios: null, installment_fee: null, max_installments: null });
    expect(rowsToSettings([{ key: "max_parcelas", value: "99" }]).max_installments).toBeNull();
    expect(rowsToSettings([{ key: "max_parcelas", value: "2.5" }]).max_installments).toBeNull();
  });
});

describe("regra de publicar: foto principal, preço e descrição", () => {
  it("lista o que falta, sempre na mesma ordem", () => {
    expect(faltaParaPublicar({ photoUrl: null, price: null, description: null })).toEqual(["foto principal", "preço", "descrição"]);
    expect(faltaParaPublicar({ photoUrl: "https://x/a.jpg", price: 0, description: "  " })).toEqual(["preço", "descrição"]);
    expect(faltaParaPublicar({ photoUrl: "  ", price: "89.90", description: "ok" })).toEqual(["foto principal"]);
    expect(faltaParaPublicar({ photoUrl: "https://x/a.jpg", price: "89.90", description: "ok" })).toEqual([]);
  });

  it("mensagem em português, no singular e no plural", () => {
    expect(mensagemDeFalta(["descrição"])).toBe("Falta: descrição para ir para o site.");
    expect(mensagemDeFalta(["foto principal", "descrição"])).toBe("Faltam: foto principal e descrição para ir para o site.");
    expect(mensagemDeFalta(["foto principal", "preço", "descrição"])).toBe("Faltam: foto principal, preço e descrição para ir para o site.");
  });

  it("bloqueia ligar o site sem foto, preço ou descrição", () => {
    const r = resolveStoreFields({ show_online: true }, FORA, VAREJO);
    expect(r).toEqual({ ok: false, error: "incomplete_for_site", message: "Falta: descrição para ir para o site." });
    const semFoto = resolveStoreFields({ show_online: true }, PRONTA_FORA, { ...VAREJO, photoUrl: null });
    expect(semFoto).toMatchObject({ ok: false, error: "incomplete_for_site" });
    const semPreco = resolveStoreFields({ show_online: true }, PRONTA_FORA, { ...VAREJO, price: null });
    expect(semPreco).toMatchObject({ ok: false, error: "incomplete_for_site" });
  });

  it("peça já publicada também não pode ficar sem descrição ou foto", () => {
    expect(resolveStoreFields({ public_description: "" }, NO_SITE, VAREJO)).toMatchObject({ ok: false, error: "incomplete_for_site" });
    expect(resolveStoreFields({}, NO_SITE, { ...VAREJO, photoUrl: null })).toMatchObject({ ok: false, error: "incomplete_for_site" });
  });

  it("tirar do site nunca é bloqueado, mesmo incompleta", () => {
    expect(resolveStoreFields({ show_online: false }, NO_SITE, { ...VAREJO, photoUrl: null })).toMatchObject({ ok: true, value: { show_online: false } });
  });

  it("descrição e foto completas deixam publicar", () => {
    expect(resolveStoreFields({ show_online: true }, PRONTA_FORA, VAREJO)).toMatchObject({ ok: true, value: { show_online: true } });
  });
});
