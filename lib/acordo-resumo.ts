import { formatCentsBRL, type Cents } from "./finance/money";

// O acordo entre João e Fernanda em palavras, com os números de hoje. Serve para a faixa que aparece
// na Visão geral, no Painel financeiro e nos Parâmetros do acordo, para o acordo estar sempre à vista.

export interface EntradaDoResumo {
  joaoSharePct: number;
  initialStockCents: Cents;
  partnershipStart: string; // AAAA-MM-DD
  debt: { totalCents: Cents; paidDirectCents: Cents; abatedCents: Cents; balanceCents: Cents; paidFraction: number };
}

export interface ResumoDoAcordo {
  partilha: string; // "João 50% · Fernanda 50%"
  joaoPct: string; // "50%"
  fernandaPct: string; // "50%"
  parteDoJoao: string; // "metade do estoque inicial"
  estoque: { valor: string; nota: string };
  divida: { total: string; pagoDireto: string; abatido: string; falta: string; fracao: number; quitada: boolean };
  frases: string[];
}

const pct = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")}%`;
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function resumoDoAcordo(e: EntradaDoResumo): ResumoDoAcordo {
  const fernandaPct = Math.round((100 - e.joaoSharePct) * 100) / 100;
  const metade = e.joaoSharePct === 50;
  const parteDoJoao = `${metade ? "metade" : pct(e.joaoSharePct)} do estoque inicial`;
  const quitada = e.debt.balanceCents === 0;
  const reais = formatCentsBRL;

  const frases = [
    `O lucro das vendas é dividido ${metade ? "meio a meio" : `${pct(e.joaoSharePct)} para o João e ${pct(fernandaPct)} para a Fernanda`}.`,
    `A Fernanda pagou o estoque inicial no cartão da empresa e paga essas faturas com o dinheiro dela. Vale para tudo o que foi comprado antes de ${dia(e.partnershipStart)}. O que for comprado depois é dos dois.`,
    `O João comprou ${metade ? "metade" : pct(e.joaoSharePct)} desse estoque para ser sócio com ${pct(e.joaoSharePct)}. Isso é a dívida dele: ${reais(e.debt.totalCents)}.`,
    quitada
      ? "A dívida está quitada. Daqui para frente, cada um fica com a sua parte do lucro."
      : `Ele já pagou ${reais(e.debt.paidDirectCents)} direto e o resto sai da parte dele no lucro das vendas, que fica com a Fernanda até quitar. Hoje ${e.debt.abatedCents > 0 ? `já foram abatidos ${reais(e.debt.abatedCents)} pelas vendas e ` : ""}faltam ${reais(e.debt.balanceCents)}.`,
  ];

  return {
    partilha: `João ${pct(e.joaoSharePct)} · Fernanda ${pct(fernandaPct)}`,
    joaoPct: pct(e.joaoSharePct),
    fernandaPct: pct(fernandaPct),
    parteDoJoao,
    estoque: {
      valor: reais(e.initialStockCents),
      nota: "Estimativa da Fernanda. Pode mudar quando as peças forem cadastradas.",
    },
    divida: {
      total: reais(e.debt.totalCents),
      pagoDireto: reais(e.debt.paidDirectCents),
      abatido: reais(e.debt.abatedCents),
      falta: reais(e.debt.balanceCents),
      fracao: e.debt.paidFraction,
      quitada,
    },
    frases,
  };
}
