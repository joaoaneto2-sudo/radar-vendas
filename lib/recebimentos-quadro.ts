// Quadro "A receber": separa os recebimentos em colunas por situação.
// Funções puras, sem banco: dá para testar com números conhecidos.
//
// Colunas: Atrasadas (previsto com data anterior a hoje), Esta semana (de hoje até daqui a 6 dias),
// Próximas (depois disso e o que ainda não tem data) e Recebidas (últimos 30 dias).
// Aporte de sócio não entra: não é dinheiro a receber nem lucro.

import { addDaysISO } from "./finance/dates";
import { Cents, toCents } from "./finance/money";
import type { WholesaleReport } from "./finance/wholesale";

export interface LinhaDoQuadro {
  kind: string;
  status: "prevista" | "recebida";
  received_date: string | null;
  expected_date: string | null;
  amount: number | string;
}

export type ColunaDoQuadro = "atrasadas" | "semana" | "proximas" | "recebidas";

export const COLUNAS: { chave: ColunaDoQuadro; titulo: string; vazio: string }[] = [
  { chave: "atrasadas", titulo: "Atrasadas", vazio: "Nada atrasado." },
  { chave: "semana", titulo: "Esta semana", vazio: "Nada previsto para esta semana." },
  { chave: "proximas", titulo: "Próximas", vazio: "Nada previsto para depois." },
  { chave: "recebidas", titulo: "Recebidas", vazio: "Nada recebido nos últimos 30 dias." },
];

export const DIAS_DE_RECEBIDAS = 30;
export const DIAS_DA_SEMANA = 7;

export interface ColunaCheia<T> {
  cartoes: T[];
  totalCents: Cents;
}

export type Quadro<T> = Record<ColunaDoQuadro, ColunaCheia<T>>;

/** Em qual coluna cai um recebimento. null = fica fora do quadro. */
export function colunaDe(l: LinhaDoQuadro, hoje: string): ColunaDoQuadro | null {
  if (l.kind === "aporte_socio") return null;

  if (l.status === "recebida") {
    if (!l.received_date) return null;
    return l.received_date >= addDaysISO(hoje, -DIAS_DE_RECEBIDAS) ? "recebidas" : null;
  }

  if (!l.expected_date) return "proximas";
  if (l.expected_date < hoje) return "atrasadas";
  if (l.expected_date <= addDaysISO(hoje, DIAS_DA_SEMANA - 1)) return "semana";
  return "proximas";
}

const porData = (a: string | null, b: string | null) => (a ?? "9999-99-99").localeCompare(b ?? "9999-99-99");

/** Monta as quatro colunas, cada uma ordenada e com o total em centavos. */
export function montarQuadro<T extends LinhaDoQuadro>(linhas: T[], hoje: string): Quadro<T> {
  const quadro: Quadro<T> = {
    atrasadas: { cartoes: [], totalCents: 0 },
    semana: { cartoes: [], totalCents: 0 },
    proximas: { cartoes: [], totalCents: 0 },
    recebidas: { cartoes: [], totalCents: 0 },
  };

  for (const l of linhas) {
    const coluna = colunaDe(l, hoje);
    if (!coluna) continue;
    quadro[coluna].cartoes.push(l);
    quadro[coluna].totalCents += toCents(l.amount);
  }

  // Os que vencem primeiro aparecem primeiro; sem data vai para o fim; recebidas: as mais novas primeiro.
  quadro.atrasadas.cartoes.sort((a, b) => porData(a.expected_date, b.expected_date));
  quadro.semana.cartoes.sort((a, b) => porData(a.expected_date, b.expected_date));
  quadro.proximas.cartoes.sort((a, b) => porData(a.expected_date, b.expected_date));
  quadro.recebidas.cartoes.sort((a, b) => porData(b.received_date, a.received_date));
  return quadro;
}

/** Quantos dias faltam de hoje até a data (negativo = já passou). */
export function diasAte(data: string, hoje: string): number {
  const [a1, m1, d1] = hoje.split("-").map(Number);
  const [a2, m2, d2] = data.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

/** Texto curto de prazo para o cartão. */
export function textoDoPrazo(l: LinhaDoQuadro, hoje: string): string {
  if (l.status === "recebida") {
    if (!l.received_date) return "Recebida";
    const dias = -diasAte(l.received_date, hoje);
    return dias <= 0 ? "Recebida hoje" : dias === 1 ? "Recebida ontem" : `Recebida há ${dias} dias`;
  }
  if (!l.expected_date) return "Sem data";
  const dias = diasAte(l.expected_date, hoje);
  if (dias < 0) return dias === -1 ? "Atrasada há 1 dia" : `Atrasada há ${-dias} dias`;
  if (dias === 0) return "Vence hoje";
  if (dias === 1) return "Vence amanhã";
  return `Vence em ${dias} dias`;
}

/** Cartão de comissão de atacado prevista pelas vendas (não é um lançamento: nasce da conta do atacado). */
export interface PrevisaoDeAtacado {
  source: "atacado";
  id: number; // número da venda
  kind: "comissao_fabricante";
  status: "prevista";
  received_date: null;
  expected_date: string | null;
  amount: string; // em reais, com 2 casas
  partner: null;
  manufacturer_id: number | null;
  manufacturer_name: string;
  sale_id: number;
  from_name: string | null;
  from_nickname: null;
  reason: string;
  payment_method: null;
}

/**
 * Comissões de atacado que ainda faltam entrar, uma por venda. Se o fabricante já tem um lembrete
 * lançado à mão, ele já aparece no quadro e a previsão automática dele fica de fora (para não repetir).
 */
export function previsoesDeAtacado(atacado: WholesaleReport): PrevisaoDeAtacado[] {
  return atacado.manufacturers
    .filter((f) => f.reminders.length === 0)
    .flatMap((f) =>
      f.items
        .filter((i) => i.pendingCents > 0)
        .map((i) => ({
          source: "atacado" as const,
          id: i.saleId,
          kind: "comissao_fabricante" as const,
          status: "prevista" as const,
          received_date: null,
          expected_date: i.dueDate,
          amount: (i.pendingCents / 100).toFixed(2),
          partner: null,
          manufacturer_id: f.manufacturerId,
          manufacturer_name: f.name,
          sale_id: i.saleId,
          from_name: i.label,
          from_nickname: null,
          reason: i.stockReceivedDate
            ? `Comissão prevista da venda de ${i.date.slice(8, 10)}/${i.date.slice(5, 7)}`
            : "Comissão prevista: aguardando o estoque chegar",
          payment_method: null,
        }))
    );
}
