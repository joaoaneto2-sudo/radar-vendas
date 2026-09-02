export type Sale = {
  id?: number;
  sale_date: string;
  sale_type?: string | null;
  seller?: string | null;
  product_type?: string | null;
  manufacturer?: string | null;
  supplier?: string | null;
  warranty?: string | null;
  cost?: number | string | null;
  sale_value?: number | string | null;
  payment_method?: string | null;
  installments_count?: number | null;
  installments_dates?: string | null;
  client_name?: string | null;
  client_nickname?: string | null;
  client_city?: string | null;
  client_phone?: string | null;
  client_birthday?: string | null;
  created_at?: string;
  product_id?: number | null;
  client_id?: number | null;
  seller_id?: number | null;
};

export type SimpleEntity = {
  id: number;
  name: string;
};

export type Client = {
  id: number;
  full_name?: string | null;
  nickname?: string | null;
  city?: string | null;
  phone?: string | null;
  birthday?: string | null;
};

export type Product = {
  id: number;
  category?: string | null;
  subtype?: string | null;
  jewelry_type?: string | null;
  name?: string | null;
  manufacturer_id?: number | null;
  manufacturer_name?: string | null;
  supplier_id?: number | null;
  supplier_name?: string | null;
  cost?: number | string | null;
  price?: number | string | null;
  stock_qty: number;
  warranty?: string | null;
  photo_url?: string | null;
  material?: string | null;
  karat?: string | null;
  gemstone?: string | null;
  age_group?: string | null;
  gender?: string | null;
  active: boolean;
};

export const PRODUCT_CATEGORIES: Record<string, string[]> = {
  "Anéis": ["Aliança", "Solitário", "Meia Aliança", "Chevalier", "Formatura", "Infantil", "Outro"],
  "Pulseiras": ["Riviera", "Elo Cubano", "Elo Português", "Berloque", "Infantil", "Outro"],
  "Colares e Correntes": ["Corrente", "Choker", "Ponto de Luz", "Gargantilha", "Outro"],
  "Brincos": ["Argola", "Ponto de Luz", "Brinco de Pressão", "Ear Cuff", "Cascata", "Infantil", "Outro"],
  "Pingentes": ["Outro"],
  "Conjuntos": ["Outro"],
  "Relógios": ["Outro"],
  "Outros": ["Outro"],
};
export const PRODUCT_CATEGORY_NAMES = Object.keys(PRODUCT_CATEGORIES);
export const JEWELRY_TYPES = ["Joia", "Semijoia", "Bijuteria"];
export const MATERIALS = ["Ouro", "Prata", "Folheado", "Aço Inox", "Outro"];
export const GEMSTONES = [
  "Sem pedra",
  "Diamante",
  "Brilhante",
  "Zircônia",
  "Moissanite",
  "Rubi",
  "Outra",
];
export const AGE_GROUPS = ["Adulto", "Infantil"];
export const GENDERS = ["Feminino", "Masculino", "Unissex"];
export const KARATS = ["10k", "14k", "18k", "24k", "Outro"];

export function buildProductDescription(f: {
  category?: string | null;
  subtype?: string | null;
  jewelry_type?: string | null;
  material?: string | null;
  karat?: string | null;
  gemstone?: string | null;
}): string {
  const bits: string[] = [];
  if (f.subtype && f.subtype !== "Outro") bits.push(f.subtype);
  else if (f.category) bits.push(f.category);

  if (f.material) {
    bits.push(f.karat ? `em ${f.material} ${f.karat}` : `em ${f.material}`);
  } else if (f.karat) {
    bits.push(f.karat);
  }

  if (f.gemstone && f.gemstone !== "Sem pedra") bits.push(`com ${f.gemstone}`);

  let text = bits.join(" ");
  if (f.jewelry_type) text = text ? `${text} (${f.jewelry_type})` : f.jewelry_type;
  return text.trim();
}

export const SALE_TYPES = ["Física", "Online", "Feira", "Catálogo", "Página de vendas"];
export const PAYMENT_METHODS = [
  "Dinheiro à vista",
  "Pix à vista",
  "Débito",
  "Crédito",
  "Crédito parcelado",
  "Pix a prazo",
];
export const INSTALLMENT_COUNT_METHODS = ["Crédito parcelado", "Pix a prazo"];
export const INSTALLMENT_DATES_METHODS = ["Pix a prazo"];

export function formatDateBR(value?: string | Date | null): string {
  if (!value) return "-";
  const iso = value instanceof Date ? value.toISOString() : value;
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return String(value);
  return `${d}/${m}/${y}`;
}

export function formatBRL(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function buildWhatsAppMessage(sale: Sale): string {
  const lines: string[] = [];
  lines.push("🚀 VENDA REALIZADA");
  lines.push("");
  lines.push(`📆 Data da venda: ${formatDateBR(sale.sale_date)}`);
  lines.push(`🛍️ Tipo de venda: ${sale.sale_type || "-"}`);
  lines.push(`⚜️ Vendedora: ${sale.seller || "-"}`);
  lines.push("");
  lines.push("💎 Descrição do produto");
  lines.push(`Tipo da peça: ${sale.product_type || "-"}`);
  lines.push(`Fabricante: ${sale.manufacturer || "-"}`);
  lines.push(`Fornecedor: ${sale.supplier || "-"}`);
  lines.push(`Garantia: ${sale.warranty || "-"}`);
  lines.push("");
  lines.push(`💰 Custo da peça: ${formatBRL(sale.cost)}`);
  lines.push(`💲 Valor da venda: ${formatBRL(sale.sale_value)}`);
  let payment = `💳 Forma de pagamento: ${sale.payment_method || "-"}`;
  if (
    sale.payment_method &&
    INSTALLMENT_COUNT_METHODS.includes(sale.payment_method) &&
    sale.installments_count
  ) {
    const count = `${sale.installments_count}x`;
    const dates =
      INSTALLMENT_DATES_METHODS.includes(sale.payment_method) && sale.installments_dates
        ? ` — datas: ${sale.installments_dates}`
        : "";
    payment += ` (${count}${dates})`;
  }
  lines.push(payment);
  lines.push("");
  lines.push("📓 Dados do cliente");
  lines.push(`Nome completo: ${sale.client_name || "-"}`);
  lines.push(`Apelido: ${sale.client_nickname || "-"}`);
  lines.push(`Praça (cidade/bairro): ${sale.client_city || "-"}`);
  lines.push(`Telefone/WhatsApp: ${sale.client_phone || "-"}`);
  lines.push(`Aniversário: ${sale.client_birthday ? formatDateBR(sale.client_birthday) : "-"}`);
  return lines.join("\n");
}
