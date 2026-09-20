// Meta do mês: o que precisamos pagar até o dia 30, e como estamos para chegar lá.
// Funções puras, sem banco: dá para testar com números conhecidos.
//
// Meta do mês = fatura do cartão (só reposição e despesa da empresa) + despesas avulsas.
// Ficam fora: a parte pessoal da Fernanda, o estoque inicial (compras antes de 01/09/26)
// e as despesas que já estão dentro da fatura (para não contar em dobro).
// "Entrou" = parcelas recebidas de varejo e consignado + comissões de fabricante recebidas.

import { addDaysISO } from "./finance/dates";
import { Cents, toCents } from "./finance/money";
import { valorVendido, type VendaLinha } from "./dashboard";

export const DIA_DA_META = 30;

/** Partes da fatura que entram na meta. */
export const NATUREZAS_DA_META = ["reposicao", "despesa_empresa"];

export interface ParteDeFaturaLinha {
  due_date: string; // vencimento da fatura
  nature: string;
  amount: number | string;
  status?: string | null; // status da fatura
}

export interface DespesaLinha {
  expense_date: string;
  amount: number | string;
  avulsa: boolean; // false = já está dentro de uma fatura do cartão
}

export interface EntradaLinha {
  date: string;
  amount: number | string;
}

// ---------- meses ----------

export const mesDe = (data: string): string => String(data).slice(0, 7);
const diaDe = (data: string): number => Number(String(data).slice(8, 10));

export function diasNoMes(mes: string): number {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Dia de referência da meta: dia 30 (ou o último dia, em fevereiro). */
export function diaDaMeta(mes: string): string {
  return `${mes}-${String(Math.min(DIA_DA_META, diasNoMes(mes))).padStart(2, "0")}`;
}

const NOME_DO_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeDoMes = (mes: string): string => NOME_DO_MES[Number(mes.slice(5, 7)) - 1];
export const rotuloDoMes = (mes: string): string => `${nomeDoMes(mes).slice(0, 3)}/${mes.slice(2, 4)}`;

// ---------- totais de um mês ----------

export interface MetaDoMes {
  faturaCents: Cents;
  faturaPagaCents: Cents; // parte da fatura que já está paga (só informativo)
  avulsasCents: Cents;
  totalCents: Cents;
}

export function metaDoMes(mes: string, partes: ParteDeFaturaLinha[], despesas: DespesaLinha[]): MetaDoMes {
  let fatura = 0;
  let paga = 0;
  for (const p of partes) {
    if (mesDe(p.due_date) !== mes || !NATUREZAS_DA_META.includes(p.nature)) continue;
    const c = toCents(p.amount);
    fatura += c;
    if (p.status === "paga") paga += c;
  }
  const avulsas = despesas
    .filter((d) => d.avulsa && mesDe(d.expense_date) === mes)
    .reduce((t, d) => t + toCents(d.amount), 0);
  return { faturaCents: fatura, faturaPagaCents: paga, avulsasCents: avulsas, totalCents: fatura + avulsas };
}

/** Vendido no mês (varejo e consignado), até um dia do mês (padrão: o mês inteiro). */
export function vendidoNoMes(vendas: VendaLinha[], mes: string, ateODia = 31): Cents {
  return vendas
    .filter((v) => v.status !== "cancelada" && mesDe(v.sale_date) === mes && diaDe(v.sale_date) <= ateODia)
    .reduce((t, v) => t + valorVendido(v), 0);
}

/** Dinheiro que entrou no mês, até um dia do mês (padrão: o mês inteiro). */
export function entrouNoMes(entradas: EntradaLinha[], mes: string, ateODia = 31): Cents {
  return entradas
    .filter((e) => mesDe(e.date) === mes && diaDe(e.date) <= ateODia)
    .reduce((t, e) => t + toCents(e.amount), 0);
}

/** Variação em porcentagem inteira; null quando não há base de comparação. */
export function variacao(atual: Cents, anterior: Cents): number | null {
  if (anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

// ---------- tabela mês a mês ----------

export type Situacao = "batida" | "em_andamento" | "nao_batida" | "futuro" | "sem_meta";

export function situacaoDoMes(mes: string, hoje: string, metaCents: Cents, entrouCents: Cents): Situacao {
  const atual = mesDe(hoje);
  if (mes > atual) return metaCents > 0 ? "futuro" : "sem_meta";
  if (metaCents <= 0) return "sem_meta";
  if (entrouCents >= metaCents) return "batida";
  return mes < atual ? "nao_batida" : "em_andamento";
}

export interface MesResumo {
  mes: string;
  rotulo: string;
  faturaCents: Cents;
  avulsasCents: Cents;
  metaCents: Cents;
  vendidoCents: Cents;
  entrouCents: Cents;
  saldoCents: Cents; // entrou menos meta: positivo = sobra, negativo = falta
  variacaoVendido: number | null; // contra o mês anterior (mês inteiro)
  situacao: Situacao;
}

export interface DadosDaMeta {
  hoje: string;
  partes: ParteDeFaturaLinha[];
  despesas: DespesaLinha[];
  vendas: VendaLinha[];
  entradas: EntradaLinha[];
}

/**
 * Meses da tabela: do primeiro mês com movimento (no máximo 5 para trás) até 2 meses à frente.
 * Sempre inclui o mês atual.
 */
export function mesesDaTabela(dados: DadosDaMeta, paraTras = 5, paraFrente = 2): string[] {
  const atual = mesDe(dados.hoje);
  const comMovimento = [
    ...dados.partes.map((p) => mesDe(p.due_date)),
    ...dados.despesas.map((d) => mesDe(d.expense_date)),
    ...dados.vendas.map((v) => mesDe(v.sale_date)),
    ...dados.entradas.map((e) => mesDe(e.date)),
  ].filter((m) => m <= atual);
  const primeiro = comMovimento.length ? comMovimento.sort()[0] : atual;
  const limite = somarMeses(atual, -paraTras);
  const inicio = primeiro < limite ? limite : primeiro;

  const meses: string[] = [];
  for (let m = inicio; m <= somarMeses(atual, paraFrente); m = somarMeses(m, 1)) meses.push(m);
  return meses;
}

export function resumoMensal(dados: DadosDaMeta): MesResumo[] {
  return mesesDaTabela(dados).map((mes) => {
    const meta = metaDoMes(mes, dados.partes, dados.despesas);
    const vendido = vendidoNoMes(dados.vendas, mes);
    const entrou = entrouNoMes(dados.entradas, mes);
    const anterior = vendidoNoMes(dados.vendas, somarMeses(mes, -1));
    return {
      mes,
      rotulo: rotuloDoMes(mes),
      faturaCents: meta.faturaCents,
      avulsasCents: meta.avulsasCents,
      metaCents: meta.totalCents,
      vendidoCents: vendido,
      entrouCents: entrou,
      saldoCents: entrou - meta.totalCents,
      variacaoVendido: variacao(vendido, anterior),
      situacao: situacaoDoMes(mes, dados.hoje, meta.totalCents, entrou),
    };
  });
}

// ---------- ritmo do mês atual ----------

export interface Ritmo {
  mes: string;
  diaDaMeta: string; // data de referência (dia 30)
  diasPassados: number; // do dia 1 até hoje, contando hoje
  diasRestantes: number; // de amanhã até o dia da meta
  metaCents: Cents;
  entrouCents: Cents;
  vendidoCents: Cents;
  faltaCents: Cents; // 0 quando a meta já foi batida
  sobraCents: Cents; // quanto passou da meta
  mediaVendaPorDia: Cents;
  mediaEntradaPorDia: Cents;
  necessidadePorDia: Cents | null; // quanto precisa entrar por dia para bater; null = sem meta ou nada falta
  vendasEquivalentes: number | null; // o que falta, em vendas do ticket médio
  projecaoEntradaCents: Cents; // no ritmo atual, quanto terá entrado no dia da meta
  projecaoVendidoCents: Cents; // no ritmo atual, quanto terá vendido no fim do mês
  vaiBater: boolean;
}

export function ritmoDoMes(dados: DadosDaMeta, ticketMedioCents: Cents): Ritmo {
  const mes = mesDe(dados.hoje);
  const alvo = diaDaMeta(mes);
  const meta = metaDoMes(mes, dados.partes, dados.despesas).totalCents;
  const entrou = entrouNoMes(dados.entradas, mes);
  const vendido = vendidoNoMes(dados.vendas, mes);

  const diasPassados = diaDe(dados.hoje);
  const diasRestantes = Math.max(diaDe(alvo) - diasPassados, 0);
  const mediaVenda = Math.round(vendido / diasPassados);
  const mediaEntrada = Math.round(entrou / diasPassados);
  const falta = Math.max(meta - entrou, 0);
  const projecaoEntrada = entrou + mediaEntrada * diasRestantes;

  return {
    mes,
    diaDaMeta: alvo,
    diasPassados,
    diasRestantes,
    metaCents: meta,
    entrouCents: entrou,
    vendidoCents: vendido,
    faltaCents: falta,
    sobraCents: Math.max(entrou - meta, 0),
    mediaVendaPorDia: mediaVenda,
    mediaEntradaPorDia: mediaEntrada,
    necessidadePorDia: meta > 0 && falta > 0 ? Math.ceil(falta / Math.max(diasRestantes, 1)) : null,
    vendasEquivalentes: falta > 0 && ticketMedioCents > 0 ? Math.ceil(falta / ticketMedioCents) : null,
    projecaoEntradaCents: projecaoEntrada,
    projecaoVendidoCents: mediaVenda * diasNoMes(mes),
    vaiBater: meta > 0 && projecaoEntrada >= meta,
  };
}

// ---------- gráfico do mês: entrada acumulada contra a meta ----------

export interface PontoAcumulado {
  dia: number;
  real: Cents | null; // null depois de hoje
  projetado: Cents | null; // só de hoje em diante
}

export function acumuladoDoMes(dados: DadosDaMeta, ritmo: Ritmo): PontoAcumulado[] {
  const ultimo = diaDe(ritmo.diaDaMeta);
  const porDia = new Map<number, Cents>();
  for (const e of dados.entradas) {
    if (mesDe(e.date) !== ritmo.mes) continue;
    porDia.set(diaDe(e.date), (porDia.get(diaDe(e.date)) ?? 0) + toCents(e.amount));
  }
  const pontos: PontoAcumulado[] = [];
  let soma = 0;
  for (let dia = 1; dia <= ultimo; dia++) {
    soma += porDia.get(dia) ?? 0;
    if (dia <= ritmo.diasPassados) {
      pontos.push({ dia, real: soma, projetado: dia === ritmo.diasPassados ? soma : null });
    } else {
      pontos.push({ dia, real: null, projetado: ritmo.entrouCents + ritmo.mediaEntradaPorDia * (dia - ritmo.diasPassados) });
    }
  }
  return pontos;
}

// ---------- comparativo justo: até o mesmo dia do mês anterior ----------

export interface Comparativo {
  mes: string;
  mesAnterior: string;
  dia: number;
  vendidoAtual: Cents;
  vendidoAnterior: Cents;
  entrouAtual: Cents;
  entrouAnterior: Cents;
  variacaoVendido: number | null;
  variacaoEntrou: number | null;
}

export function comparativoAteHoje(dados: DadosDaMeta): Comparativo {
  const mes = mesDe(dados.hoje);
  const anterior = somarMeses(mes, -1);
  const dia = Math.min(diaDe(dados.hoje), diasNoMes(anterior));
  const vendidoAtual = vendidoNoMes(dados.vendas, mes, diaDe(dados.hoje));
  const vendidoAnterior = vendidoNoMes(dados.vendas, anterior, dia);
  const entrouAtual = entrouNoMes(dados.entradas, mes, diaDe(dados.hoje));
  const entrouAnterior = entrouNoMes(dados.entradas, anterior, dia);
  return {
    mes,
    mesAnterior: anterior,
    dia,
    vendidoAtual,
    vendidoAnterior,
    entrouAtual,
    entrouAnterior,
    variacaoVendido: variacao(vendidoAtual, vendidoAnterior),
    variacaoEntrou: variacao(entrouAtual, entrouAnterior),
  };
}

// ---------- tendência das vendas ----------

export type Direcao = "subindo" | "estavel" | "caindo";

export interface Tendencia {
  estado: "poucos_meses" | Direcao;
  mesesUsados: number;
  inclinacaoCents: Cents; // quanto o vendido muda, em média, a cada mês
  previsaoProximoMesCents: Cents | null;
}

export const MESES_MINIMOS_PARA_TENDENCIA = 3;

/**
 * Reta ajustada (mínimos quadrados) sobre o vendido dos meses já fechados, do primeiro mês com venda
 * até o mês passado (no máximo 6). Com menos de 3 meses, diz que ainda é cedo, sem inventar.
 */
export function tendenciaDasVendas(vendas: VendaLinha[], hoje: string, maximoDeMeses = 6): Tendencia {
  const atual = mesDe(hoje);
  const comVenda = vendas
    .filter((v) => v.status !== "cancelada" && valorVendido(v) > 0 && mesDe(v.sale_date) < atual)
    .map((v) => mesDe(v.sale_date))
    .sort();
  if (comVenda.length === 0) return { estado: "poucos_meses", mesesUsados: 0, inclinacaoCents: 0, previsaoProximoMesCents: null };

  const ultimo = somarMeses(atual, -1);
  const primeiroPossivel = somarMeses(ultimo, -(maximoDeMeses - 1));
  const inicio = comVenda[0] < primeiroPossivel ? primeiroPossivel : comVenda[0];
  const valores: Cents[] = [];
  for (let m = inicio; m <= ultimo; m = somarMeses(m, 1)) valores.push(vendidoNoMes(vendas, m));

  const n = valores.length;
  if (n < MESES_MINIMOS_PARA_TENDENCIA) {
    return { estado: "poucos_meses", mesesUsados: n, inclinacaoCents: 0, previsaoProximoMesCents: null };
  }

  const mediaX = (n - 1) / 2;
  const mediaY = valores.reduce((t, v) => t + v, 0) / n;
  let numerador = 0;
  let denominador = 0;
  valores.forEach((y, x) => {
    numerador += (x - mediaX) * (y - mediaY);
    denominador += (x - mediaX) ** 2;
  });
  const inclinacao = denominador === 0 ? 0 : numerador / denominador;
  const relativa = mediaY > 0 ? inclinacao / mediaY : 0;
  const estado: Direcao = relativa > 0.05 ? "subindo" : relativa < -0.05 ? "caindo" : "estavel";

  return {
    estado,
    mesesUsados: n,
    inclinacaoCents: Math.round(inclinacao),
    previsaoProximoMesCents: Math.max(Math.round(mediaY + inclinacao * (n - mediaX)), 0),
  };
}

/** Dia seguinte, útil para quem monta textos de prazo. */
export const amanha = (hoje: string): string => addDaysISO(hoje, 1);
