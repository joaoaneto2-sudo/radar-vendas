import { describe, expect, it } from "vitest";
import {
  NO_FILTERS,
  distinctValues,
  filterSales,
  filtersFromParams,
  filtersToQuery,
  hasActiveFilters,
  type FilterableSale,
} from "../../lib/sales-filter";

const VENDAS: (FilterableSale & { id: number })[] = [
  { id: 1, sale_date: "2026-09-01", seller: "Fernanda", price_tier: "varejo", product_type: "Anel Solitário", payment_method: "Pix à vista" },
  { id: 2, sale_date: "2026-09-05", seller: "João", price_tier: "atacado", product_type: "Brinco Argola", payment_method: "Pix direto ao fabricante" },
  { id: 3, sale_date: "2026-09-10", seller: "Fernanda", price_tier: "consignado", product_type: "Anel Solitário", payment_method: null },
  { id: 4, sale_date: "2026-09-15T00:00:00.000Z", seller: null, price_tier: undefined, product_type: null, payment_method: "Pix a prazo" },
];

const ids = (lista: { id: number }[]) => lista.map((v) => v.id);

describe("filtros do relatório de vendas", () => {
  it("sem filtro, mostra tudo", () => {
    expect(ids(filterSales(VENDAS, NO_FILTERS))).toEqual([1, 2, 3, 4]);
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
  });

  it("período: inclui o primeiro e o último dia", () => {
    expect(ids(filterSales(VENDAS, { ...NO_FILTERS, from: "2026-09-05", to: "2026-09-10" }))).toEqual([2, 3]);
    expect(ids(filterSales(VENDAS, { ...NO_FILTERS, from: "2026-09-11" }))).toEqual([4]);
  });

  it("por vendedora", () => {
    expect(ids(filterSales(VENDAS, { ...NO_FILTERS, seller: "Fernanda" }))).toEqual([1, 3]);
  });

  it("por tipo de saída: venda antiga sem tipo conta como varejo", () => {
    expect(ids(filterSales(VENDAS, { ...NO_FILTERS, tier: "atacado" }))).toEqual([2]);
    expect(ids(filterSales(VENDAS, { ...NO_FILTERS, tier: "consignado" }))).toEqual([3]);
    expect(ids(filterSales(VENDAS, { ...NO_FILTERS, tier: "varejo" }))).toEqual([1, 4]);
  });

  it("por peça", () => {
    expect(ids(filterSales(VENDAS, { ...NO_FILTERS, piece: "Anel Solitário" }))).toEqual([1, 3]);
  });

  it("por pagamento: vazio conta como Não informada", () => {
    expect(ids(filterSales(VENDAS, { ...NO_FILTERS, payment: "Pix à vista" }))).toEqual([1]);
    expect(ids(filterSales(VENDAS, { ...NO_FILTERS, payment: "Não informada" }))).toEqual([3]);
  });

  it("filtros juntos: todos precisam bater", () => {
    const f = { ...NO_FILTERS, seller: "Fernanda", piece: "Anel Solitário", tier: "consignado" };
    expect(ids(filterSales(VENDAS, f))).toEqual([3]);
    expect(hasActiveFilters(f)).toBe(true);
  });

  it("listas de escolha: sem repetidos nem vazios, em ordem", () => {
    expect(distinctValues(VENDAS.map((v) => v.seller))).toEqual(["Fernanda", "João"]);
    expect(distinctValues(["b", "a", "b", "", null, undefined])).toEqual(["a", "b"]);
  });

  it("vai e volta pelo endereço, só com o que foi preenchido", () => {
    const f = { ...NO_FILTERS, from: "2026-09-01", tier: "atacado", payment: "Pix a prazo" };
    const consulta = filtersToQuery(f);
    expect(consulta).toBe("?from=2026-09-01&tier=atacado&payment=Pix+a+prazo");
    expect(filtersFromParams(new URLSearchParams(consulta))).toEqual(f);
    expect(filtersToQuery(NO_FILTERS)).toBe("");
  });
});
