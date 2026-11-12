import { toCents, type Cents } from "./finance/money";
import { addDaysISO } from "./finance/dates";
import { valorVendido, type VendaLinha } from "./dashboard";

// Meta dos cartões (regras do João em 11/11/2026).
// PLANO PRINCIPAL: toda venda de varejo desde 01/11 é dividida: 10% guardados para a Riachuelo
// (vence 13/11) e 90% para a Santander (vence 02/12).
// SUGESTÃO (para não pagar juros): usar o caixa inteiro para pagar a Riachuelo no vencimento e
// juntar a sobra com as vendas seguintes para pagar a Santander inteira em 02/12.
// Nos dois casos, o dinheiro de cada vencimento conta até as 20h do próprio dia do vencimento
// (o dia do vencimento é dia de venda). Conta o VALOR VENDIDO (parcelado pelo total), sem atacado
// (pago direto ao fabricante) e sem vendas canceladas.

export interface Cartao {
  nome: string;
  totalCents: Cents;
  parte: number; // fração de cada venda guardada para este cartão no plano principal
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

/** Dias de venda depois de `dia` até `vence`, contando o próprio vencimento (dinheiro até as 20h). */
export function diasDeVendaAte(dia: string, vence: string): number {
  let n = 0;
  for (let d = addDaysISO(dia, 1); d <= vence; d = addDaysISO(d, 1)) {
    if (DIAS_DE_TRABALHO.has(diaDaSemana(d)) || d === vence) n += 1;
  }
  return n;
}

const porDia = (c: Cents, dias: number) => (dias > 0 ? Math.ceil(c / dias) : c);

export interface SituacaoDoCartao {
  nome: string;
  totalCents: Cents;
  parte: number;
  vence: string;
  guardadoCents: Cents; // parte das vendas reservada para este cartão
  faltaGuardarCents: Cents;
  precisaVenderCents: Cents; // total de vendas ainda necessário até as 20h do vencimento
  diasDeVenda: number;
  precisaPorDiaCents: Cents;
  vencido: boolean;
  quitado: boolean;
}

export interface SugestaoCaixaUnico {
  primeiro: string; // cartão pago primeiro com o caixa
  primeiroCoberto: boolean;
  faltaPrimeiroCents: Cents; // se o caixa ainda não cobre o primeiro cartão
  ultimo: string;
  ultimoVence: string;
  sobraDepoisDoPrimeiroCents: Cents;
  precisaVenderCents: Cents; // até as 20h do último vencimento, para pagar as duas faturas inteiras
  diasDeVenda: number;
  precisaPorDiaCents: Cents;
}

export interface MetaDosCartoes {
  inicio: string;
  acumuladoCents: Cents;
  vendas: number;
  cartoes: SituacaoDoCartao[];
  sugestao: SugestaoCaixaUnico | null; // null quando o primeiro cartão já venceu
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
  const ordem = [...cartoes].sort((a, b) => a.vence.localeCompare(b.vence));

  const situacoes = ordem.map((c) => {
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
      precisaPorDiaCents: porDia(precisaVenderCents, diasDeVenda),
      vencido: dia > c.vence,
      quitado: faltaGuardarCents === 0,
    };
  });

  let sugestao: SugestaoCaixaUnico | null = null;
  if (ordem.length >= 2 && dia <= ordem[0].vence) {
    const primeiro = ordem[0];
    const ultimo = ordem[ordem.length - 1];
    const totalFaturas = ordem.reduce((t, c) => t + c.totalCents, 0);
    const precisaVenderCents = Math.max(0, totalFaturas - acumuladoCents);
    const diasDeVenda = diasDeVendaAte(dia, ultimo.vence);
    sugestao = {
      primeiro: primeiro.nome,
      primeiroCoberto: acumuladoCents >= primeiro.totalCents,
      faltaPrimeiroCents: Math.max(0, primeiro.totalCents - acumuladoCents),
      ultimo: ultimo.nome,
      ultimoVence: ultimo.vence,
      sobraDepoisDoPrimeiroCents: Math.max(0, acumuladoCents - primeiro.totalCents),
      precisaVenderCents,
      diasDeVenda,
      precisaPorDiaCents: porDia(precisaVenderCents, diasDeVenda),
    };
  }

  return { inicio, acumuladoCents, vendas: contam.length, cartoes: situacoes, sugestao };
}
