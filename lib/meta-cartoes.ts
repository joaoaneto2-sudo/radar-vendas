import { toCents, type Cents } from "./finance/money";
import { addDaysISO } from "./finance/dates";
import { valorVendido, type VendaLinha } from "./dashboard";

// Meta dos cartões (regras do João em 11/11/2026).
// - Caixa único: todo o valor vendido no varejo desde 01/11 forma um só caixa.
// - Os cartões são pagos em ordem de vencimento: primeiro a Riachuelo (13/11), depois a Santander (02/12).
//   O que sobra depois de pagar um cartão, mais as vendas seguintes, paga o próximo.
// - O dinheiro de cada vencimento conta até as 20h do próprio dia do vencimento,
//   então o dia do vencimento também é dia de venda.
// - Conta o VALOR VENDIDO no dia da venda (parcelado entra pelo total). Atacado não entra
//   (é pago direto ao fabricante). Vendas canceladas não entram.

export interface Cartao {
  nome: string;
  totalCents: Cents; // valor da fatura a pagar
  vence: string; // AAAA-MM-DD
}

export const INICIO_META_CARTOES = "2026-11-01";

export const CARTOES: Cartao[] = [
  { nome: "Riachuelo", totalCents: toCents("2290.00"), vence: "2026-11-13" },
  { nome: "Santander", totalCents: toCents("11500.00"), vence: "2026-12-02" },
];

/** Dias normais de trabalho: terça (2) a sábado (6). */
const DIAS_DE_TRABALHO = new Set([2, 3, 4, 5, 6]);
const diaDaSemana = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

export interface SituacaoDoCartao {
  nome: string;
  totalCents: Cents;
  vence: string;
  guardadoCents: Cents; // quanto do caixa já cobre esta fatura (depois de pagar as anteriores)
  faltaCents: Cents; // quanto ainda falta para esta fatura
  precisaVenderCents: Cents; // quanto ainda precisa vender até as 20h do vencimento (inclui as faturas anteriores que faltam)
  diasDeVenda: number; // dias de trabalho depois de hoje até o vencimento, contando o dia do vencimento
  precisaPorDiaCents: Cents;
  vencido: boolean; // o vencimento já passou (considerado pago com o caixa)
  coberto: boolean; // o caixa já cobre esta fatura
}

export interface MetaDosCartoes {
  inicio: string;
  vendidoCents: Cents; // vendas de varejo desde o início até o dia (o caixa)
  vendas: number;
  sobraCents: Cents; // o que sobra no caixa depois de cobrir todas as faturas
  cartoes: SituacaoDoCartao[];
}

/** Dias de trabalho (terça a sábado) depois de `dia` até `vence`, contando o próprio vencimento. */
export function diasDeVendaAte(dia: string, vence: string): number {
  let n = 0;
  for (let d = addDaysISO(dia, 1); d <= vence; d = addDaysISO(d, 1)) {
    if (DIAS_DE_TRABALHO.has(diaDaSemana(d)) || d === vence) n += 1;
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
  const vendidoCents = contam.reduce((t, v) => t + valorVendido(v), 0);

  const ordem = [...cartoes].sort((a, b) => a.vence.localeCompare(b.vence));
  let caixa = vendidoCents;
  let acumuladoDasFaturas = 0; // soma das faturas até esta (inclusive)
  const situacoes = ordem.map((c) => {
    acumuladoDasFaturas += c.totalCents;
    const guardadoCents = Math.max(0, Math.min(caixa, c.totalCents));
    caixa -= c.totalCents; // pode ficar negativo: o que falta passa para as próximas
    const faltaCents = c.totalCents - guardadoCents;
    const precisaVenderCents = Math.max(0, acumuladoDasFaturas - vendidoCents);
    const diasDeVenda = diasDeVendaAte(dia, c.vence);
    return {
      nome: c.nome,
      totalCents: c.totalCents,
      vence: c.vence,
      guardadoCents,
      faltaCents,
      precisaVenderCents,
      diasDeVenda,
      precisaPorDiaCents: diasDeVenda > 0 ? Math.ceil(precisaVenderCents / diasDeVenda) : precisaVenderCents,
      vencido: dia > c.vence,
      coberto: faltaCents === 0,
    };
  });

  return { inicio, vendidoCents, vendas: contam.length, sobraCents: Math.max(0, caixa), cartoes: situacoes };
}
