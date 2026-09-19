import type { SaleInput, Settings } from "../lib/finance/cascade";
import { toCents } from "../lib/finance/money";

// Dados do briefing (seção 5), usados como teste de aceitação.
// Tudo em centavos. Varejo, forma de pagamento "Não informada".

export const SETTINGS_ACORDO: Settings = {
  retailPct: 30,
  wholesalePct: 0,
  joaoSharePct: 50,
  initialStockCents: 1500000, // R$ 15.000
  mode: "venda",
};

// [data, cliente, valor em reais]
export const VENDAS_DO_BRIEFING: [string, string, string][] = [
  ["2026-09-01", "Vendas do dia (lote 1)", "590.00"],
  ["2026-09-01", "Vendas do dia (lote 2)", "280.00"],
  ["2026-09-02", "Giovana", "82.50"],
  ["2026-09-03", "Andreia Psicóloga", "374.00"],
  ["2026-09-04", "Raquel", "500.00"],
  ["2026-09-04", "Patrícia ADV", "398.46"],
  ["2026-09-06", "Elizabete", "280.00"],
  ["2026-09-11", "Kika", "1276.00"],
  ["2026-09-11", "Michele", "2507.00"],
];

export function vendasDoBriefing(): SaleInput[] {
  return VENDAS_DO_BRIEFING.map(([data, , valor], i) => ({
    id: i + 1,
    date: data,
    amountCents: toCents(valor),
    costsCents: 0,
    tier: "varejo" as const,
    status: "ativa" as const,
    paymentMethod: "Não informada",
    payments: [],
  }));
}

// Resultado esperado do briefing (seção 6), em centavos.
export const ESPERADO = {
  vendido: 628796, // R$ 6.287,96
  reposicao: 188639, // R$ 1.886,39
  lucro: 440157, // R$ 4.401,57
  abatido: 220079, // R$ 2.200,79
  saldoDevedor: 429921, // R$ 4.299,21
  fernandaRecebe: 440157,
  joaoRecebe: 0,
  reposicoesAPagar: 532000, // R$ 5.320,00
  fundoMenosAPagar: -343361, // -R$ 3.433,61
};
