// Regras da loja online sobre a peça: "No site", "Carrossel", preço promocional e descrição.
// O banco também garante essas regras; aqui elas viram mensagens claras em português.
//
// Cuidado importante: campo vazio é "sem valor", NUNCA zero (Number("") dá 0 no JavaScript).

export interface StoreState {
  show_online: boolean;
  featured: boolean;
  sale_price: number | null; // vazio = sem promoção
  public_description: string | null;
}

export interface StoreContext {
  saleChannel: string | null | undefined; // "varejo" ou "atacado"
  price: number | null; // preço normal da peça
  photoUrl: string | null | undefined; // foto principal da peça
}

export type StoreResult =
  | { ok: true; value: StoreState; notes: string[] }
  | { ok: false; error: string; message: string };

export const WHOLESALE_BLOCK_MESSAGE = "Peça do fabricante (atacado) não vai para o site.";

/** Valor em reais digitado: vazio vira null (nunca 0); "12,50" e "12.50" funcionam; lixo devolve "invalido". */
export function readMoneyOrNull(v: unknown): number | null | "invalido" {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : "invalido";
  if (typeof v !== "string") return "invalido";
  const texto = v.trim().replace(/\s/g, "");
  if (texto === "") return null;
  const normal = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto;
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return "invalido";
  return Math.round(Number(normal) * 100) / 100;
}

/** Número inteiro digitado: vazio vira null; "-3", "12.5" e lixo devolvem "invalido". */
export function readIntOrNull(v: unknown): number | null | "invalido" {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return Number.isInteger(v) ? v : "invalido";
  if (typeof v !== "string") return "invalido";
  const texto = v.trim();
  if (texto === "") return null;
  if (!/^-?\d+$/.test(texto)) return "invalido";
  return Number(texto);
}

function flag(v: unknown, atual: boolean): boolean {
  if (v === undefined) return atual;
  return v === true || v === "true" || v === 1 || v === "1";
}

const tem = (obj: Record<string, unknown>, chave: string) => Object.prototype.hasOwnProperty.call(obj, chave);

/** O que falta para a peça poder ir para o site: foto principal, preço maior que zero e descrição. */
export function faltaParaPublicar(p: {
  photoUrl?: string | null;
  price?: number | string | null;
  description?: string | null;
}): string[] {
  const falta: string[] = [];
  if (!p.photoUrl || String(p.photoUrl).trim() === "") falta.push("foto principal");
  const preco = p.price === null || p.price === undefined || p.price === "" ? null : Number(p.price);
  if (preco === null || !Number.isFinite(preco) || preco <= 0) falta.push("preço");
  if (!p.description || p.description.trim() === "") falta.push("descrição");
  return falta;
}

export function mensagemDeFalta(falta: string[]): string {
  const lista = falta.length <= 1 ? falta.join("") : `${falta.slice(0, -1).join(", ")} e ${falta[falta.length - 1]}`;
  return `${falta.length === 1 ? "Falta" : "Faltam"}: ${lista} para ir para o site.`;
}

/**
 * Junta o que veio da tela com o que a peça já tem e aplica as regras.
 * Chaves que não vieram mantêm o valor atual.
 */
export function resolveStoreFields(
  input: Record<string, unknown>,
  atual: StoreState,
  ctx: StoreContext
): StoreResult {
  const notes: string[] = [];

  let showOnline = flag(input.show_online, atual.show_online);
  let featured = flag(input.featured, atual.featured);

  if (showOnline && ctx.saleChannel === "atacado") {
    return { ok: false, error: "wholesale_not_allowed", message: WHOLESALE_BLOCK_MESSAGE };
  }

  // Carrossel só com "No site" ligado; desligar o site desliga o carrossel.
  if (!showOnline && featured) {
    if (tem(input, "featured") && input.featured === true && !(tem(input, "show_online") && input.show_online === false)) {
      return {
        ok: false,
        error: "featured_needs_online",
        message: 'Para ir para o carrossel, a peça precisa estar "No site".',
      };
    }
    featured = false;
    notes.push("O carrossel foi desligado junto com o site.");
  }
  if (!showOnline) featured = false;

  let salePrice = atual.sale_price;
  if (tem(input, "sale_price")) {
    const lido = readMoneyOrNull(input.sale_price);
    if (lido === "invalido") {
      return { ok: false, error: "invalid_sale_price", message: "O preço promocional não é um valor válido." };
    }
    salePrice = lido;
  }
  if (salePrice !== null) {
    if (salePrice <= 0) {
      return { ok: false, error: "invalid_sale_price", message: "O preço promocional precisa ser maior que zero." };
    }
    if (ctx.price === null) {
      return {
        ok: false,
        error: "sale_price_needs_price",
        message: "Informe o preço normal da peça antes de colocar um preço promocional.",
      };
    }
    if (salePrice >= ctx.price) {
      return {
        ok: false,
        error: "sale_price_not_lower",
        message: "O preço promocional precisa ser menor que o preço normal.",
      };
    }
  }

  let description = atual.public_description;
  if (tem(input, "public_description")) {
    const texto = typeof input.public_description === "string" ? input.public_description.trim() : "";
    description = texto === "" ? null : texto;
  }

  // Só vai para o site peça com foto principal, preço e descrição (vale também ao editar peça já publicada).
  if (showOnline) {
    const falta = faltaParaPublicar({ photoUrl: ctx.photoUrl, price: ctx.price, description });
    if (falta.length > 0) return { ok: false, error: "incomplete_for_site", message: mensagemDeFalta(falta) };
  }

  return { ok: true, value: { show_online: showOnline, featured, sale_price: salePrice, public_description: description }, notes };
}

// ---------------------------------------------------------------------------
// Ajustes da loja (entrega e parcelamento)

// Cada valor em branco (nulo) significa "a chave não existe": a loja usa o padrão dela
// (R$ 10 por parcela, 12x) e mostra a entrega como "a combinar". "origem_atual" é diferente:
// ela nunca fica em branco (sempre grava salvador ou recife); se a chave não existe, é 'salvador'.
export interface StoreSettingsValues {
  delivery_salvador: number | null;
  shipping_correios: number | null;
  installment_fee: number | null;
  max_installments: number | null;
  origem_atual: "salvador" | "recife";
  cep_origem_salvador: string | null; // 8 números, sem traço
  cep_origem_recife: string | null;
  entrega_recife: number | null;
  caixa_comprimento_cm: number | null;
  caixa_largura_cm: number | null;
  caixa_altura_cm: number | null;
  caixa_peso_g: number | null;
}

// Mínimo aceito pelos Correios para a caixinha (comprimento, largura, altura, em cm).
export const CAIXA_MINIMO_CM = { comprimento: 16, largura: 11, altura: 2 } as const;

// Chaves da tabela store_settings (chave e valor em texto) que a loja lê.
export const STORE_SETTING_KEYS = {
  delivery_salvador: "entrega_salvador",
  shipping_correios: "correios",
  installment_fee: "acrescimo_parcela",
  max_installments: "max_parcelas",
  origem_atual: "origem_atual",
  cep_origem_salvador: "cep_origem_salvador",
  cep_origem_recife: "cep_origem_recife",
  entrega_recife: "entrega_recife",
  caixa_comprimento_cm: "caixa_comprimento_cm",
  caixa_largura_cm: "caixa_largura_cm",
  caixa_altura_cm: "caixa_altura_cm",
  caixa_peso_g: "caixa_peso_g",
} as const;

/** Como cada valor vira texto na tabela: dinheiro com 2 casas ("15.00") e número inteiro ("12"). */
export function settingsToRows(v: StoreSettingsValues): { key: string; value: string | null }[] {
  const dinheiro = (n: number | null) => (n === null ? null : n.toFixed(2));
  const inteiroOuNulo = (n: number | null) => (n === null ? null : String(n));
  return [
    { key: STORE_SETTING_KEYS.delivery_salvador, value: dinheiro(v.delivery_salvador) },
    { key: STORE_SETTING_KEYS.shipping_correios, value: dinheiro(v.shipping_correios) },
    { key: STORE_SETTING_KEYS.installment_fee, value: dinheiro(v.installment_fee) },
    { key: STORE_SETTING_KEYS.max_installments, value: v.max_installments === null ? null : String(v.max_installments) },
    { key: STORE_SETTING_KEYS.origem_atual, value: v.origem_atual },
    { key: STORE_SETTING_KEYS.cep_origem_salvador, value: v.cep_origem_salvador },
    { key: STORE_SETTING_KEYS.cep_origem_recife, value: v.cep_origem_recife },
    { key: STORE_SETTING_KEYS.entrega_recife, value: dinheiro(v.entrega_recife) },
    { key: STORE_SETTING_KEYS.caixa_comprimento_cm, value: inteiroOuNulo(v.caixa_comprimento_cm) },
    { key: STORE_SETTING_KEYS.caixa_largura_cm, value: inteiroOuNulo(v.caixa_largura_cm) },
    { key: STORE_SETTING_KEYS.caixa_altura_cm, value: inteiroOuNulo(v.caixa_altura_cm) },
    { key: STORE_SETTING_KEYS.caixa_peso_g, value: inteiroOuNulo(v.caixa_peso_g) },
  ];
}

/** Lê as linhas da tabela (chave e valor em texto) de volta para os campos da tela. Valor estranho vira vazio. */
export function rowsToSettings(rows: { key: string; value: string | null }[]): StoreSettingsValues {
  const mapa = new Map(rows.map((r) => [r.key, r.value]));
  const dinheiro = (k: string) => {
    const lido = readMoneyOrNull(mapa.get(k) ?? null);
    return lido === "invalido" || lido === null || lido < 0 ? null : lido;
  };
  const inteiro = (k: string) => {
    const texto = (mapa.get(k) ?? "").trim();
    const n = /^[0-9]+$/.test(texto) ? Number(texto) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= 24 ? n : null;
  };
  const inteiroPositivo = (k: string, minimo: number) => {
    const texto = (mapa.get(k) ?? "").trim();
    const n = /^[0-9]+$/.test(texto) ? Number(texto) : NaN;
    return Number.isInteger(n) && n >= minimo ? n : null;
  };
  const cep = (k: string) => {
    const texto = (mapa.get(k) ?? "").trim();
    return /^\d{8}$/.test(texto) ? texto : null;
  };
  const origem = mapa.get(STORE_SETTING_KEYS.origem_atual);
  return {
    delivery_salvador: dinheiro(STORE_SETTING_KEYS.delivery_salvador),
    shipping_correios: dinheiro(STORE_SETTING_KEYS.shipping_correios),
    installment_fee: dinheiro(STORE_SETTING_KEYS.installment_fee),
    max_installments: inteiro(STORE_SETTING_KEYS.max_installments),
    origem_atual: origem === "recife" ? "recife" : "salvador",
    cep_origem_salvador: cep(STORE_SETTING_KEYS.cep_origem_salvador),
    cep_origem_recife: cep(STORE_SETTING_KEYS.cep_origem_recife),
    entrega_recife: dinheiro(STORE_SETTING_KEYS.entrega_recife),
    caixa_comprimento_cm: inteiroPositivo(STORE_SETTING_KEYS.caixa_comprimento_cm, 1),
    caixa_largura_cm: inteiroPositivo(STORE_SETTING_KEYS.caixa_largura_cm, 1),
    caixa_altura_cm: inteiroPositivo(STORE_SETTING_KEYS.caixa_altura_cm, 1),
    caixa_peso_g: inteiroPositivo(STORE_SETTING_KEYS.caixa_peso_g, 1),
  };
}

export type StoreSettingsResult =
  | { ok: true; value: StoreSettingsValues }
  | { ok: false; error: string; message: string };

export function parseStoreSettings(body: Record<string, unknown>): StoreSettingsResult {
  const rotulos: Record<string, string> = {
    delivery_salvador: "O valor da entrega em Salvador",
    shipping_correios: "O valor do envio pelos Correios",
    entrega_recife: "O valor da entrega em Recife",
  };
  const opcionais: Record<string, number | null> = {};
  for (const chave of ["delivery_salvador", "shipping_correios", "entrega_recife"]) {
    const lido = readMoneyOrNull(body[chave]);
    if (lido === "invalido" || (lido !== null && lido < 0)) {
      return { ok: false, error: `invalid_${chave}`, message: `${rotulos[chave]} precisa ser um valor válido (ou ficar em branco).` };
    }
    opcionais[chave] = lido;
  }

  // Origem das peças: nunca fica em branco. Sem nada na tela (ou algo estranho), considera Salvador.
  const origemBruta = typeof body.origem_atual === "string" ? body.origem_atual.trim() : body.origem_atual;
  let origem: "salvador" | "recife" = "salvador";
  if (origemBruta === "recife") origem = "recife";
  else if (origemBruta !== undefined && origemBruta !== null && origemBruta !== "" && origemBruta !== "salvador") {
    return { ok: false, error: "invalid_origem_atual", message: 'A origem das peças precisa ser "Salvador" ou "Recife".' };
  }

  // CEP de origem: opcional; se vier algo, precisa sobrar exatamente 8 números depois de tirar traço e espaço.
  const rotuloCep: Record<string, string> = {
    cep_origem_salvador: "O CEP de origem em Salvador",
    cep_origem_recife: "O CEP de origem em Recife",
  };
  const ceps: Record<string, string | null> = {};
  for (const chave of ["cep_origem_salvador", "cep_origem_recife"]) {
    const bruto = body[chave];
    if (bruto === undefined || bruto === null || String(bruto).trim() === "") {
      ceps[chave] = null;
      continue;
    }
    const digitos = String(bruto).replace(/\D/g, "");
    if (!/^\d{8}$/.test(digitos)) {
      return { ok: false, error: `invalid_${chave}`, message: `${rotuloCep[chave]} precisa ter 8 números (ou ficar em branco).` };
    }
    ceps[chave] = digitos;
  }

  // Caixinha padrão de envio: cada medida é independente; se vier algo, vale o mínimo dos Correios.
  const rotuloCaixa: Record<string, { nome: string; minimo: number; unidade: string }> = {
    caixa_comprimento_cm: { nome: "O comprimento da caixinha", minimo: CAIXA_MINIMO_CM.comprimento, unidade: "cm" },
    caixa_largura_cm: { nome: "A largura da caixinha", minimo: CAIXA_MINIMO_CM.largura, unidade: "cm" },
    caixa_altura_cm: { nome: "A altura da caixinha", minimo: CAIXA_MINIMO_CM.altura, unidade: "cm" },
  };
  const caixa: Record<string, number | null> = {};
  for (const chave of Object.keys(rotuloCaixa)) {
    const lido = readIntOrNull(body[chave]);
    const r = rotuloCaixa[chave];
    if (lido === "invalido") {
      return { ok: false, error: `invalid_${chave}`, message: `${r.nome} precisa ser um número inteiro (ou ficar em branco).` };
    }
    if (lido !== null && lido < r.minimo) {
      return { ok: false, error: `invalid_${chave}`, message: `${r.nome} precisa ser de pelo menos ${r.minimo} ${r.unidade} (mínimo dos Correios).` };
    }
    caixa[chave] = lido;
  }

  const peso = readIntOrNull(body.caixa_peso_g);
  if (peso === "invalido") {
    return { ok: false, error: "invalid_caixa_peso_g", message: "O peso da caixinha precisa ser um número inteiro (ou ficar em branco)." };
  }
  if (peso !== null && peso < 1) {
    return { ok: false, error: "invalid_caixa_peso_g", message: "O peso da caixinha precisa ser maior que zero." };
  }

  const taxa = readMoneyOrNull(body.installment_fee);
  if (taxa === "invalido" || (taxa !== null && taxa < 0)) {
    return {
      ok: false,
      error: "invalid_installment_fee",
      message: "O acréscimo por parcela precisa ser um valor válido (0 ou mais), ou ficar em branco.",
    };
  }

  const bruto = typeof body.max_installments === "string" ? body.max_installments.trim() : body.max_installments;
  const vazio = bruto === "" || bruto === null || bruto === undefined;
  const maximo = vazio ? null : Number(bruto);
  if (maximo !== null && (!Number.isInteger(maximo) || maximo < 1 || maximo > 24)) {
    return { ok: false, error: "invalid_max_installments", message: "O máximo de parcelas precisa ser um número de 1 a 24, ou ficar em branco." };
  }

  return {
    ok: true,
    value: {
      delivery_salvador: opcionais.delivery_salvador,
      shipping_correios: opcionais.shipping_correios,
      installment_fee: taxa,
      max_installments: maximo,
      origem_atual: origem,
      cep_origem_salvador: ceps.cep_origem_salvador,
      cep_origem_recife: ceps.cep_origem_recife,
      entrega_recife: opcionais.entrega_recife,
      caixa_comprimento_cm: caixa.caixa_comprimento_cm,
      caixa_largura_cm: caixa.caixa_largura_cm,
      caixa_altura_cm: caixa.caixa_altura_cm,
      caixa_peso_g: peso,
    },
  };
}
