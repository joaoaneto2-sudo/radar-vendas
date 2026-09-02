export type Sale = {
  id?: number;
  sale_date: string;
  sale_type: string;
  seller: string;
  product_type: string;
  manufacturer?: string | null;
  supplier?: string | null;
  warranty?: string | null;
  cost: number | string;
  sale_value: number | string;
  payment_method: string;
  installments_count?: number | null;
  installments_dates?: string | null;
  client_name: string;
  client_nickname?: string | null;
  client_city?: string | null;
  client_phone?: string | null;
  client_birthday?: string | null;
  created_at?: string;
};

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
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return "R$ 0,00";
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
  lines.push(`🛍️ Tipo de venda: ${sale.sale_type}`);
  lines.push(`⚜️ Vendedora: ${sale.seller}`);
  lines.push("");
  lines.push("💎 Descrição do produto");
  lines.push(`Tipo da peça: ${sale.product_type}`);
  lines.push(`Fabricante: ${sale.manufacturer || "-"}`);
  lines.push(`Fornecedor: ${sale.supplier || "-"}`);
  lines.push(`Garantia: ${sale.warranty || "-"}`);
  lines.push("");
  lines.push(`💰 Custo da peça: ${formatBRL(sale.cost)}`);
  lines.push(`💲 Valor da venda: ${formatBRL(sale.sale_value)}`);
  let payment = `💳 Forma de pagamento: ${sale.payment_method}`;
  if (INSTALLMENT_COUNT_METHODS.includes(sale.payment_method) && sale.installments_count) {
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
  lines.push(`Nome completo: ${sale.client_name}`);
  lines.push(`Apelido: ${sale.client_nickname || "-"}`);
  lines.push(`Praça (cidade/bairro): ${sale.client_city || "-"}`);
  lines.push(`Telefone/WhatsApp: ${sale.client_phone || "-"}`);
  lines.push(`Aniversário: ${sale.client_birthday ? formatDateBR(sale.client_birthday) : "-"}`);
  return lines.join("\n");
}
