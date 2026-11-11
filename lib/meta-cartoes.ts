import { toCents, type Cents } from "./finance/money";
import { addDaysISO } from "./finance/dates";
import { valorVendido, type VendaLinha } from "./dashboard";

// Meta dos cartões (combinada com o João em 11/11/2026).
// Toda venda de varejo feita no Radar desde 01/11/2026 é dividida assim:
// 10% guardados para o cartão Riachuelo (vence dia 13) e 90% para o cartão Santander (vence 02/12).
// Conta o VALOR VENDIDO no dia da venda (parcelado entra pelo total). Atacado não entra
// (o dinheiro do atacado é pago direto ao fabricante). Vendas canceladas não entram.

export interface Cartao {
  nome: string;
  totalCents: Cents; // valor da fatura a pagar
  parte: number; // fração de cada venda guardada para este cartão (0.1 = 10%)
  vence: string; // AAAA-MM-DD
}

export const INICIO_META_CARTOES = "2026-11-01";

export const CARTOES: Cartao[] = [
  { nome: "Riachuelo", totalCents: toCents("2290.00"), parte: 0.1, vence: "2026-11-13" },
  { nome: "Santander", totalCents: toCents("11500.00"), parte: 0.9, vence: "2026-12-02" },
];

/** Dias normais de trabalho: terça (2) a sábado (6). */
const DIAS_DE_TRABALHO = new Set([2, 3, 4, 5, 6]);
const diaDaSemana = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

export interface SituacaoDoCartao {
  nome: string;
  totalCents: Cents;
  parte: number;
  vence: string;
  guardadoCents: Cents; // parte das vendas acumuladas já reservada para este cartão
  faltaGuardarCents: Cents;
  precisaVenderCents: Cents; // quanto ainda precisa vender (total) para cobrir o que falta
  diasDeVenda: number; // dias de trabalho depois de hoje e antes do vencimento
  precisaPorDiaCents: Cents;
  vencido: boolean; // o vencimento já passou
  quitado: boolean; // o guardado já cobre a fatura
}

export interface MetaDosCartoes {
  inicio: string;
  acumuladoCents: Cents; // vendas de varejo desde o início até o dia
  vendas: number;
  cartoes: SituacaoDoCartao[];
}

/** Dias de trabalho (terça a sábado) depois de `dia` e antes de `vence`. */
export function diasDeVendaAte(dia: string, vence: string): number {
  let n = 0;
  for (let d = addDaysISO(dia, 1); d < vence; d = addDaysISO(d, 1)) {
    if (DIAS_DE_TRABALHO.has(diaDaSemana(d))) n += 1;
  }
  return n;
}

export function metaDosCartoes(
  vendas: VendaLinha[],
  dia: string,
  cartoes: Cartao[] = CARTOES,
  inicio: string = INICIO_META_CARTOES
): MetaDosCartoes {
  const contam = vendas.filter((v) => {
    const d = String(v.sale_date).slice(0, 10);
    return v.status !== "cancelada" && v.price_tier !== "atacado" && d >= inicio && d <= dia;
  });
  const acumuladoCents = contam.reduce((t, v) => t + valorVendido(v), 0);

  return {
    inicio,
    acumuladoCents,
    vendas: contam.length,
    cartoes: cartoes.map((c) => {
      const guardadoCents = Math.round(acumuladoCents * c.parte);
      const faltaGuardarCents = Math.max(0, c.totalCents - guardadoCents);
      const precisaVenderCents = c.parte > 0 ? Math.ceil(faltaGuardarCents / c.parte) : 0;
      const diasDeVenda = diasDeVendaAte(dia, c.vence);
      return {
        nome: c.nome,
        totalCents: c.totalCents,
        parte: c.parte,
        vence: c.vence,
        guardadoCents,
        faltaGuardarCents,
        precisaVenderCents,
        diasDeVenda,
        precisaPorDiaCents: diasDeVenda > 0 ? Math.ceil(precisaVenderCents / diasDeVenda) : precisaVenderCents,
        vencido: dia > c.vence,
        quitado: faltaGuardarCents === 0,
      };
    }),
  };
}
