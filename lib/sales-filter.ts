// Filtros do Relatório de vendas: período, vendedora, tipo de saída, peça e pagamento.
// Usado pela tela e também pelo Excel, para o arquivo sair igual ao que está na tela.

import { NAO_INFORMADA } from "./sale-finance";

export interface SaleFilters {
  from: string; // AAAA-MM-DD ou vazio
  to: string;
  seller: string;
  tier: string; // varejo | atacado | consignado | vazio
  piece: string; // nome da peça (tipo da peça) ou vazio
  payment: string; // forma de pagamento ou vazio
}

export const NO_FILTERS: SaleFilters = { from: "", to: "", seller: "", tier: "", piece: "", payment: "" };

export interface FilterableSale {
  sale_date: string;
  seller?: string | null;
  price_tier?: string | null;
  product_type?: string | null;
  payment_method?: string | null;
}

/** Forma de pagamento como aparece na tela: vazio conta como "Não informada". */
export function paymentLabel(s: FilterableSale): string {
  return s.payment_method || NAO_INFORMADA;
}

export function matchesFilters(s: FilterableSale, f: SaleFilters): boolean {
  const dia = String(s.sale_date).slice(0, 10);
  if (f.from && dia < f.from) return false;
  if (f.to && dia > f.to) return false;
  if (f.seller && s.seller !== f.seller) return false;
  if (f.tier && (s.price_tier ?? "varejo") !== f.tier) return false;
  if (f.piece && s.product_type !== f.piece) return false;
  if (f.payment && paymentLabel(s) !== f.payment) return false;
  return true;
}

export function filterSales<T extends FilterableSale>(sales: T[], f: SaleFilters): T[] {
  return sales.filter((s) => matchesFilters(s, f));
}

export function hasActiveFilters(f: SaleFilters): boolean {
  return Object.values(f).some((v) => v !== "");
}

/** Valores distintos (sem vazios), em ordem alfabética, para montar as listas de escolha. */
export function distinctValues(valores: (string | null | undefined)[]): string[] {
  return Array.from(new Set(valores.filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

const CHAVES: (keyof SaleFilters)[] = ["from", "to", "seller", "tier", "piece", "payment"];

/** Filtros como texto de endereço (?from=...&tier=...), só com o que foi preenchido. */
export function filtersToQuery(f: SaleFilters): string {
  const params = new URLSearchParams();
  for (const chave of CHAVES) if (f[chave]) params.set(chave, f[chave]);
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export function filtersFromParams(params: URLSearchParams): SaleFilters {
  const f = { ...NO_FILTERS };
  for (const chave of CHAVES) f[chave] = (params.get(chave) ?? "").trim();
  return f;
}
