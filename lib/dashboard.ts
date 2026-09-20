// Cálculos da Visão geral (tela inicial): junta linhas do banco em números para os gráficos.
// Funções puras, sem banco: dá para testar com números conhecidos.

import { addDaysISO } from "./finance/dates";
import { Cents, pctOf, toCents } from "./finance/money";

export type Periodo = "semana" | "mes" | "ano" | "tudo";

export const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "semana", rotulo: "7 dias" },
  { valor: "mes", rotulo: "Este mês" },
  { valor: "ano", rotulo: "Este ano" },
  { valor: "tudo", rotulo: "Tudo" },
];

export function parsePeriodo(v: unknown): Periodo {
  return v === "semana" || v === "ano" || v === "tudo" ? v : "mes";
}

export interface Intervalo {
  from: string | null; // AAAA-MM-DD, ou null = desde sempre
  to: string;
}

export function periodRange(periodo: Periodo, hoje: string): Intervalo {
  switch (periodo) {
    case "semana":
      return { from: addDaysISO(hoje, -6), to: hoje };
    case "mes":
      return { from: `${hoje.slice(0, 7)}-01`, to: hoje };
    case "ano":
      return { from: `${hoje.slice(0, 4)}-01-01`, to: hoje };
    default:
      return { from: null, to: hoje };
  }
}

export interface VendaLinha {
  sale_date: string;
  sale_value: number | string | null;
  price_tier?: string | null;
  status?: string | null;
  payment_method?: string | null;
  seller?: string | null;
  product_type?: string | null;
  client_name?: string | null;
  commission_pct?: number | string | null; // só se o fabricante é representado
}

const dia = (v: string) => String(v).slice(0, 10);

export function dentroDoIntervalo(data: string, r: Intervalo): boolean {
  const d = dia(data);
  return (r.from === null || d >= r.from) && d <= r.to;
}

/** Vendas ativas dentro do período. */
export function vendasDoPeriodo<T extends VendaLinha>(vendas: T[], r: Intervalo): T[] {
  return vendas.filter((v) => v.status !== "cancelada" && dentroDoIntervalo(v.sale_date, r));
}

export function ehAtacado(v: VendaLinha): boolean {
  return v.price_tier === "atacado";
}

/** Valor vendido ao cliente (varejo e consignado). No atacado o cliente paga ao fabricante: fica de fora. */
export function valorVendido(v: VendaLinha): Cents {
  if (ehAtacado(v)) return 0;
  return v.sale_value === null || v.sale_value === "" ? 0 : toCents(v.sale_value);
}

/** Comissão que a empresa ganha numa venda de atacado (0 se o fabricante não é representado). */
export function comissaoDoAtacado(v: VendaLinha): Cents {
  if (!ehAtacado(v) || v.commission_pct === null || v.commission_pct === undefined) return 0;
  const bruto = v.sale_value === null || v.sale_value === "" ? 0 : toCents(v.sale_value);
  return pctOf(bruto, Number(v.commission_pct));
}

/** Receita da empresa: o vendido no varejo e consignado mais a comissão do atacado. */
export function receitaDaEmpresa(v: VendaLinha): Cents {
  return valorVendido(v) + comissaoDoAtacado(v);
}

export interface Ponto {
  chave: string;
  rotulo: string;
  cents: Cents;
}

const NOME_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function diasEntre(de: string, ate: string): string[] {
  const lista: string[] = [];
  let atual = de;
  for (let i = 0; i < 400 && atual <= ate; i++) {
    lista.push(atual);
    atual = addDaysISO(atual, 1);
  }
  return lista;
}

/**
 * Valor vendido por dia (7 dias, mês) ou por mês (ano, tudo). Dias sem venda aparecem com zero,
 * para o gráfico não "pular" datas.
 */
export function vendidoPorTempo(vendas: VendaLinha[], periodo: Periodo, r: Intervalo): Ponto[] {
  const validas = vendas.filter((v) => v.status !== "cancelada" && dentroDoIntervalo(v.sale_date, r));

  if (periodo === "semana" || periodo === "mes") {
    const de = r.from ?? r.to;
    const porDia = new Map<string, Cents>();
    for (const v of validas) porDia.set(dia(v.sale_date), (porDia.get(dia(v.sale_date)) ?? 0) + valorVendido(v));
    return diasEntre(de, r.to).map((d) => ({
      chave: d,
      rotulo: `${d.slice(8, 10)}/${d.slice(5, 7)}`,
      cents: porDia.get(d) ?? 0,
    }));
  }

  // Por mês, do primeiro mês com venda até o mês atual.
  const porMes = new Map<string, Cents>();
  for (const v of validas) {
    const m = dia(v.sale_date).slice(0, 7);
    porMes.set(m, (porMes.get(m) ?? 0) + valorVendido(v));
  }
  const primeiro = [...porMes.keys()].sort()[0] ?? r.to.slice(0, 7);
  const meses: string[] = [];
  let [a, m] = primeiro.split("-").map(Number);
  const [fa, fm] = r.to.slice(0, 7).split("-").map(Number);
  while ((a < fa || (a === fa && m <= fm)) && meses.length < 60) {
    meses.push(`${a}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return meses.map((k) => ({
    chave: k,
    rotulo: `${NOME_MES[Number(k.slice(5, 7)) - 1]}/${k.slice(2, 4)}`,
    cents: porMes.get(k) ?? 0,
  }));
}

export interface Parte {
  rotulo: string;
  cents: Cents;
  quantidade: number;
}

/** Agrupa e soma, do maior para o menor. Vazio vira o texto informado. */
export function somarPor<T>(
  linhas: T[],
  chave: (l: T) => string | null | undefined,
  valor: (l: T) => Cents,
  semNome = "Não informado"
): Parte[] {
  const mapa = new Map<string, Parte>();
  for (const l of linhas) {
    const nome = (chave(l) ?? "").trim() || semNome;
    const atual = mapa.get(nome) ?? { rotulo: nome, cents: 0, quantidade: 0 };
    atual.cents += valor(l);
    atual.quantidade += 1;
    mapa.set(nome, atual);
  }
  return [...mapa.values()].sort((a, b) => b.cents - a.cents || b.quantidade - a.quantidade || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Os N maiores; o resto vira "Outros". */
export function primeiros(partes: Parte[], n: number, rotuloDoResto = "Outros"): Parte[] {
  if (partes.length <= n) return partes;
  const top = partes.slice(0, n);
  const resto = partes.slice(n);
  return [
    ...top,
    {
      rotulo: rotuloDoResto,
      cents: resto.reduce((t, p) => t + p.cents, 0),
      quantidade: resto.reduce((t, p) => t + p.quantidade, 0),
    },
  ];
}

const DIAS_DA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Valor vendido em cada dia da semana (domingo a sábado). */
export function totalPorDiaDaSemana(vendas: VendaLinha[]): Ponto[] {
  const totais = Array.from({ length: 7 }, () => 0);
  for (const v of vendas) {
    const [a, m, d] = dia(v.sale_date).split("-").map(Number);
    const semana = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
    totais[semana] += valorVendido(v);
  }
  return totais.map((cents, i) => ({ chave: String(i), rotulo: DIAS_DA_SEMANA[i], cents }));
}

export interface ParcelaLinha {
  due_date: string | null;
  amount: number | string;
}

/**
 * Dinheiro a receber por semana: primeiro o que já venceu ("Atrasadas"), depois as próximas semanas
 * a partir de hoje, e por fim "Sem data" para o que ainda não tem data prevista.
 */
export function receberPorSemana(parcelas: ParcelaLinha[], hoje: string, semanas = 6): Ponto[] {
  const pontos: Ponto[] = [{ chave: "atrasadas", rotulo: "Atrasadas", cents: 0 }];
  for (let i = 0; i < semanas; i++) {
    const inicio = addDaysISO(hoje, i * 7);
    pontos.push({ chave: inicio, rotulo: i === 0 ? "Esta semana" : `${inicio.slice(8, 10)}/${inicio.slice(5, 7)}`, cents: 0 });
  }
  pontos.push({ chave: "depois", rotulo: "Depois", cents: 0 });
  pontos.push({ chave: "sem-data", rotulo: "Sem data", cents: 0 });

  for (const p of parcelas) {
    const cents = toCents(p.amount);
    if (!p.due_date) {
      pontos[pontos.length - 1].cents += cents;
      continue;
    }
    const d = dia(p.due_date);
    if (d < hoje) {
      pontos[0].cents += cents;
      continue;
    }
    const indice = Math.floor(diasEntre(hoje, d).length - 1) / 7;
    const semana = Math.floor(indice);
    if (semana >= semanas) pontos[pontos.length - 2].cents += cents;
    else pontos[1 + semana].cents += cents;
  }
  return pontos;
}

/** Porcentagem inteira de parte sobre o todo (0 se o todo for zero). */
export function porcentagem(parte: Cents, todo: Cents): number {
  return todo <= 0 ? 0 : Math.round((parte / todo) * 100);
}

/** Ticket médio: valor vendido dividido pelas vendas de varejo e consignado. */
export function ticketMedio(vendas: VendaLinha[]): Cents {
  const com = vendas.filter((v) => !ehAtacado(v) && valorVendido(v) > 0);
  if (com.length === 0) return 0;
  return Math.round(com.reduce((t, v) => t + valorVendido(v), 0) / com.length);
}
