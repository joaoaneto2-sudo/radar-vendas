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

function flag(v: unknown, atual: boolean): boolean {
  if (v === undefined) return atual;
  return v === true || v === "true" || v === 1 || v === "1";
}

const tem = (obj: Record<string, unknown>, chave: string) => Object.prototype.hasOwnProperty.call(obj, chave);

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

  return { ok: true, value: { show_online: showOnline, featured, sale_price: salePrice, public_description: description }, notes };
}

// ---------------------------------------------------------------------------
// Ajustes da loja (entrega e parcelamento)

export interface StoreSettingsValues {
  delivery_salvador: number | null; // vazio = ainda não definido
  shipping_correios: number | null;
  installment_fee: number;
  max_installments: number;
}

export type StoreSettingsResult =
  | { ok: true; value: StoreSettingsValues }
  | { ok: false; error: string; message: string };

export function parseStoreSettings(body: Record<string, unknown>): StoreSettingsResult {
  const rotulos: Record<string, string> = {
    delivery_salvador: "O valor da entrega em Salvador",
    shipping_correios: "O valor do envio pelos Correios",
  };
  const opcionais: Record<string, number | null> = {};
  for (const chave of ["delivery_salvador", "shipping_correios"]) {
    const lido = readMoneyOrNull(body[chave]);
    if (lido === "invalido" || (lido !== null && lido < 0)) {
      return { ok: false, error: `invalid_${chave}`, message: `${rotulos[chave]} precisa ser um valor válido (ou ficar em branco).` };
    }
    opcionais[chave] = lido;
  }

  const taxa = readMoneyOrNull(body.installment_fee);
  if (taxa === null || taxa === "invalido" || taxa < 0) {
    return { ok: false, error: "invalid_installment_fee", message: "Informe o acréscimo por parcela (pode ser 0)." };
  }

  const bruto = typeof body.max_installments === "string" ? body.max_installments.trim() : body.max_installments;
  const maximo = bruto === "" || bruto === null || bruto === undefined ? NaN : Number(bruto);
  if (!Number.isInteger(maximo) || maximo < 1 || maximo > 24) {
    return { ok: false, error: "invalid_max_installments", message: "O máximo de parcelas precisa ser um número de 1 a 24." };
  }

  return {
    ok: true,
    value: {
      delivery_salvador: opcionais.delivery_salvador,
      shipping_correios: opcionais.shipping_correios,
      installment_fee: taxa,
      max_installments: maximo,
    },
  };
}
