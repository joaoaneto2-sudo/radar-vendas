import { describe, expect, it } from "vitest";
import {
  WHOLESALE_BLOCK_MESSAGE,
  faltaParaPublicar,
  mensagemDeFalta,
  parseStoreSettings,
  readIntOrNull,
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
  const CAMPOS_NOVOS_EM_BRANCO = {
    origem_atual: "salvador",
    cep_origem_salvador: null,
    cep_origem_recife: null,
    entrega_recife: null,
    caixa_comprimento_cm: null,
    caixa_largura_cm: null,
    caixa_altura_cm: null,
    caixa_peso_g: null,
  };

  it("valores completos", () => {
    expect(parseStoreSettings(BOM)).toEqual({
      ok: true,
      value: { delivery_salvador: 15, shipping_correios: 32.9, installment_fee: 10, max_installments: 12, ...CAMPOS_NOVOS_EM_BRANCO },
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

  describe("origem das peças", () => {
    it("Salvador ou Recife; sem nada, considera Salvador", () => {
      expect(parseStoreSettings({ ...BOM, origem_atual: "recife" })).toMatchObject({ ok: true, value: { origem_atual: "recife" } });
      expect(parseStoreSettings({ ...BOM, origem_atual: "salvador" })).toMatchObject({ ok: true, value: { origem_atual: "salvador" } });
      expect(parseStoreSettings(BOM)).toMatchObject({ ok: true, value: { origem_atual: "salvador" } });
      expect(parseStoreSettings({ ...BOM, origem_atual: "" })).toMatchObject({ ok: true, value: { origem_atual: "salvador" } });
    });

    it("aceita espaço em volta (tolerante), mas recusa maiúscula ou outro texto", () => {
      expect(parseStoreSettings({ ...BOM, origem_atual: " recife " })).toMatchObject({ ok: true, value: { origem_atual: "recife" } });
      expect(parseStoreSettings({ ...BOM, origem_atual: "Recife" })).toMatchObject({ ok: false, error: "invalid_origem_atual" });
      expect(parseStoreSettings({ ...BOM, origem_atual: "sao_paulo" })).toMatchObject({ ok: false, error: "invalid_origem_atual" });
    });
  });

  describe("CEP de origem", () => {
    it("em branco fica sem valor; aceita com ou sem traço, sempre 8 números", () => {
      expect(parseStoreSettings({ ...BOM, cep_origem_salvador: "" })).toMatchObject({ ok: true, value: { cep_origem_salvador: null } });
      expect(parseStoreSettings({ ...BOM, cep_origem_salvador: "40015-970" })).toMatchObject({
        ok: true,
        value: { cep_origem_salvador: "40015970" },
      });
      expect(parseStoreSettings({ ...BOM, cep_origem_recife: "50030 230" })).toMatchObject({
        ok: true,
        value: { cep_origem_recife: "50030230" },
      });
    });

    it("recusa com menos ou mais de 8 números", () => {
      expect(parseStoreSettings({ ...BOM, cep_origem_salvador: "4001597" })).toMatchObject({ ok: false, error: "invalid_cep_origem_salvador" });
      expect(parseStoreSettings({ ...BOM, cep_origem_salvador: "400159700" })).toMatchObject({ ok: false, error: "invalid_cep_origem_salvador" });
      expect(parseStoreSettings({ ...BOM, cep_origem_recife: "abc" })).toMatchObject({ ok: false, error: "invalid_cep_origem_recife" });
    });
  });

  describe("entrega em Recife", () => {
    it("mesma regra da entrega em Salvador: em branco é 'a combinar', pode ser 0, recusa negativo", () => {
      expect(parseStoreSettings({ ...BOM, entrega_recife: "" })).toMatchObject({ ok: true, value: { entrega_recife: null } });
      expect(parseStoreSettings({ ...BOM, entrega_recife: "0" })).toMatchObject({ ok: true, value: { entrega_recife: 0 } });
      expect(parseStoreSettings({ ...BOM, entrega_recife: "12,50" })).toMatchObject({ ok: true, value: { entrega_recife: 12.5 } });
      expect(parseStoreSettings({ ...BOM, entrega_recife: "-1" })).toMatchObject({ ok: false, error: "invalid_entrega_recife" });
    });
  });

  describe("caixinha padrão de envio", () => {
    it("cada medida é independente; em branco fica sem valor", () => {
      const r = parseStoreSettings({ ...BOM, caixa_comprimento_cm: "20", caixa_largura_cm: "", caixa_altura_cm: "3", caixa_peso_g: "50" });
      expect(r).toMatchObject({
        ok: true,
        value: { caixa_comprimento_cm: 20, caixa_largura_cm: null, caixa_altura_cm: 3, caixa_peso_g: 50 },
      });
    });

    it("recusa abaixo do mínimo dos Correios (16 x 11 x 2 cm)", () => {
      expect(parseStoreSettings({ ...BOM, caixa_comprimento_cm: "15" })).toMatchObject({ ok: false, error: "invalid_caixa_comprimento_cm" });
      expect(parseStoreSettings({ ...BOM, caixa_largura_cm: "10" })).toMatchObject({ ok: false, error: "invalid_caixa_largura_cm" });
      expect(parseStoreSettings({ ...BOM, caixa_altura_cm: "1" })).toMatchObject({ ok: false, error: "invalid_caixa_altura_cm" });
      expect(parseStoreSettings({ ...BOM, caixa_comprimento_cm: "16" })).toMatchObject({ ok: true, value: { caixa_comprimento_cm: 16 } });
      expect(parseStoreSettings({ ...BOM, caixa_largura_cm: "11" })).toMatchObject({ ok: true, value: { caixa_largura_cm: 11 } });
      expect(parseStoreSettings({ ...BOM, caixa_altura_cm: "2" })).toMatchObject({ ok: true, value: { caixa_altura_cm: 2 } });
    });

    it("recusa medida que não é número inteiro", () => {
      expect(parseStoreSettings({ ...BOM, caixa_comprimento_cm: "20,5" })).toMatchObject({ ok: false, error: "invalid_caixa_comprimento_cm" });
      expect(parseStoreSettings({ ...BOM, caixa_comprimento_cm: "abc" })).toMatchObject({ ok: false, error: "invalid_caixa_comprimento_cm" });
    });

    it("peso: maior que zero; em branco fica sem valor", () => {
      expect(parseStoreSettings({ ...BOM, caixa_peso_g: "" })).toMatchObject({ ok: true, value: { caixa_peso_g: null } });
      expect(parseStoreSettings({ ...BOM, caixa_peso_g: "1" })).toMatchObject({ ok: true, value: { caixa_peso_g: 1 } });
      expect(parseStoreSettings({ ...BOM, caixa_peso_g: "0" })).toMatchObject({ ok: false, error: "invalid_caixa_peso_g" });
      expect(parseStoreSettings({ ...BOM, caixa_peso_g: "-5" })).toMatchObject({ ok: false, error: "invalid_caixa_peso_g" });
      expect(parseStoreSettings({ ...BOM, caixa_peso_g: "80,5" })).toMatchObject({ ok: false, error: "invalid_caixa_peso_g" });
    });
  });
});

describe("ajustes da loja: ida e volta para chave e valor", () => {
  const CAMPOS_NOVOS_EM_BRANCO = {
    origem_atual: "salvador" as const,
    cep_origem_salvador: null,
    cep_origem_recife: null,
    entrega_recife: null,
    caixa_comprimento_cm: null,
    caixa_largura_cm: null,
    caixa_altura_cm: null,
    caixa_peso_g: null,
  };

  it("vira texto no formato da loja: dinheiro com 2 casas e parcelas inteiras", () => {
    expect(
      settingsToRows({
        delivery_salvador: 15,
        shipping_correios: 25.5,
        installment_fee: 10,
        max_installments: 12,
        origem_atual: "recife",
        cep_origem_salvador: "40015970",
        cep_origem_recife: "50030230",
        entrega_recife: 12,
        caixa_comprimento_cm: 20,
        caixa_largura_cm: 15,
        caixa_altura_cm: 5,
        caixa_peso_g: 150,
      })
    ).toEqual([
      { key: "entrega_salvador", value: "15.00" },
      { key: "correios", value: "25.50" },
      { key: "acrescimo_parcela", value: "10.00" },
      { key: "max_parcelas", value: "12" },
      { key: "origem_atual", value: "recife" },
      { key: "cep_origem_salvador", value: "40015970" },
      { key: "cep_origem_recife", value: "50030230" },
      { key: "entrega_recife", value: "12.00" },
      { key: "caixa_comprimento_cm", value: "20" },
      { key: "caixa_largura_cm", value: "15" },
      { key: "caixa_altura_cm", value: "5" },
      { key: "caixa_peso_g", value: "150" },
    ]);
  });

  it("valor em branco vira nulo (a chave será apagada), zero continua zero; origem sempre grava um texto", () => {
    const linhas = settingsToRows({
      delivery_salvador: null,
      shipping_correios: 0,
      installment_fee: null,
      max_installments: null,
      ...CAMPOS_NOVOS_EM_BRANCO,
    });
    expect(linhas).toEqual([
      { key: "entrega_salvador", value: null },
      { key: "correios", value: "0.00" },
      { key: "acrescimo_parcela", value: null },
      { key: "max_parcelas", value: null },
      { key: "origem_atual", value: "salvador" },
      { key: "cep_origem_salvador", value: null },
      { key: "cep_origem_recife", value: null },
      { key: "entrega_recife", value: null },
      { key: "caixa_comprimento_cm", value: null },
      { key: "caixa_largura_cm", value: null },
      { key: "caixa_altura_cm", value: null },
      { key: "caixa_peso_g", value: null },
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
    ).toEqual({ delivery_salvador: 15, shipping_correios: null, installment_fee: null, max_installments: 12, ...CAMPOS_NOVOS_EM_BRANCO });
    expect(rowsToSettings([])).toEqual({
      delivery_salvador: null,
      shipping_correios: null,
      installment_fee: null,
      max_installments: null,
      ...CAMPOS_NOVOS_EM_BRANCO,
    });
    expect(rowsToSettings([{ key: "max_parcelas", value: "99" }]).max_installments).toBeNull();
    expect(rowsToSettings([{ key: "max_parcelas", value: "2.5" }]).max_installments).toBeNull();
  });

  it("origem: lê salvador, recife, e qualquer outra coisa (ou ausente) vira salvador", () => {
    expect(rowsToSettings([{ key: "origem_atual", value: "recife" }]).origem_atual).toBe("recife");
    expect(rowsToSettings([{ key: "origem_atual", value: "salvador" }]).origem_atual).toBe("salvador");
    expect(rowsToSettings([{ key: "origem_atual", value: "sao_paulo" }]).origem_atual).toBe("salvador");
    expect(rowsToSettings([]).origem_atual).toBe("salvador");
  });

  it("CEP: só volta se tiver exatamente 8 números; senão vira vazio", () => {
    expect(rowsToSettings([{ key: "cep_origem_salvador", value: "40015970" }]).cep_origem_salvador).toBe("40015970");
    expect(rowsToSettings([{ key: "cep_origem_salvador", value: "4001597" }]).cep_origem_salvador).toBeNull();
    expect(rowsToSettings([{ key: "cep_origem_salvador", value: "4001-5970" }]).cep_origem_salvador).toBeNull();
  });

  it("caixinha: só volta número inteiro de 1 ou mais; senão vira vazio", () => {
    expect(rowsToSettings([{ key: "caixa_comprimento_cm", value: "20" }]).caixa_comprimento_cm).toBe(20);
    expect(rowsToSettings([{ key: "caixa_peso_g", value: "0" }]).caixa_peso_g).toBeNull();
    expect(rowsToSettings([{ key: "caixa_peso_g", value: "12,5" }]).caixa_peso_g).toBeNull();
  });
});

describe("números inteiros digitados (readIntOrNull)", () => {
  it("vazio, espaço e nulo viram null; aceita inteiro positivo e negativo", () => {
    expect(readIntOrNull("")).toBeNull();
    expect(readIntOrNull("  ")).toBeNull();
    expect(readIntOrNull(null)).toBeNull();
    expect(readIntOrNull(undefined)).toBeNull();
    expect(readIntOrNull("20")).toBe(20);
    expect(readIntOrNull("-3")).toBe(-3);
    expect(readIntOrNull(20)).toBe(20);
  });

  it("recusa decimal e texto", () => {
    expect(readIntOrNull("20,5")).toBe("invalido");
    expect(readIntOrNull("20.5")).toBe("invalido");
    expect(readIntOrNull("abc")).toBe("invalido");
    expect(readIntOrNull(20.5)).toBe("invalido");
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
