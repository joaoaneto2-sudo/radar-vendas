// Regras do financeiro dentro do cadastro da venda: modalidade (varejo, atacado ou consignado),
// custos, taxa, parcelas do Pix a prazo e dados do atacado. Usado pela tela e pelo servidor.
// Regra de ouro do cadastro: nada aqui impede de salvar. Valor esquisito vira "vazio" ou zero.

import { addDaysISO } from "./finance/dates";
import { pctOf } from "./finance/money";
import { lerValor } from "./receipts";

export type PriceTier = "varejo" | "atacado" | "consignado";

export const PRICE_TIERS: { value: PriceTier; label: string; hint: string }[] = [
  { value: "varejo", label: "Varejo", hint: "Venda de peça nossa ao cliente final." },
  {
    value: "atacado",
    label: "Atacado",
    hint: "Peça de fabricante representado, pronta entrega. O cliente paga direto ao fabricante e a empresa recebe a comissão.",
  },
  {
    value: "consignado",
    label: "Consignado",
    hint: "Peça nossa que uma revendedora levou para pagar depois, quando vender.",
  },
];

export const PIX_A_PRAZO = "Pix a prazo";
export const PIX_DIRETO_AO_FABRICANTE = "Pix direto ao fabricante";
export const NAO_INFORMADA = "Não informada";

export interface PaymentRow {
  due_date: string; // AAAA-MM-DD ou vazio
  amount: string; // texto digitado, em reais
  received: boolean;
  received_date: string; // AAAA-MM-DD, só vale se received
}

export function isTier(v: unknown): v is PriceTier {
  return v === "varejo" || v === "atacado" || v === "consignado";
}

/** Converte texto digitado em centavos sem nunca dar erro (inválido vira 0). */
export function centsOrZero(v: unknown): number {
  const n = lerValor(v);
  return n === null ? 0 : Math.round(n * 100);
}

/** Divide um total em N partes iguais; a última leva a sobra de centavos. */
export function splitCents(totalCents: number, n: number): number[] {
  if (n <= 0 || totalCents <= 0) return Array.from({ length: Math.max(n, 0) }, () => 0);
  const base = Math.floor(totalCents / n);
  const partes = Array.from({ length: n }, () => base);
  partes[n - 1] = totalCents - base * (n - 1);
  return partes;
}

/** Mesmo dia nos meses seguintes; se o mês não tem o dia (31), usa o último dia do mês. */
export function addMonthsISO(data: string, meses: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  if (!ano || !mes || !dia) return data;
  const primeiroDoMesAlvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(primeiroDoMesAlvo.getUTCFullYear(), primeiroDoMesAlvo.getUTCMonth() + 1, 0)).getUTCDate();
  primeiroDoMesAlvo.setUTCDate(Math.min(dia, ultimoDia));
  return primeiroDoMesAlvo.toISOString().slice(0, 10);
}

function reais(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/** Sugere N parcelas: valor igual e uma por mês, a partir de um mês depois da venda. */
export function suggestPayments(saleValue: string, n: number, saleDate: string): PaymentRow[] {
  const valores = splitCents(centsOrZero(saleValue), n);
  return valores.map((cents, i) => ({
    due_date: saleDate ? addMonthsISO(saleDate, i + 1) : "",
    amount: cents > 0 ? reais(cents) : "",
    received: false,
    received_date: "",
  }));
}

/** Soma das parcelas menos o valor da venda, em centavos (0 = fecha certinho). */
export function paymentsDifference(saleValue: string, rows: PaymentRow[]): number {
  return rows.reduce((soma, r) => soma + centsOrZero(r.amount), 0) - centsOrZero(saleValue);
}

/** Comissão da empresa sobre uma venda de atacado, em centavos. */
export function commissionCents(saleValue: string | number, commissionPct: number | null | undefined): number {
  if (commissionPct === null || commissionPct === undefined) return 0;
  return pctOf(centsOrZero(saleValue), Number(commissionPct));
}

// ---------------------------------------------------------------------------
// Servidor: lê e limpa o que veio da tela.

export interface PaymentDb {
  due_date: string | null;
  amount: number;
  status: "prevista" | "recebida";
  received_date: string | null;
}

export interface SaleFinance {
  priceTier: PriceTier | null; // null: não veio, mantém o que já existe (edição)
  saleCosts: number | null;
  paymentFee: number | null;
  hasManufacturer: boolean;
  manufacturerId: number | null;
  hasStockDate: boolean;
  stockReceivedDate: string | null;
  payments: PaymentDb[] | null; // null: não mexer nas parcelas
}

function dataValida(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const dia = v.slice(0, 10);
  const d = new Date(`${dia}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dia ? null : dia;
}

function naoNegativo(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = lerValor(v);
  return n === null ? 0 : Math.max(0, n);
}

const tem = (body: Record<string, unknown>, chave: string) => Object.prototype.hasOwnProperty.call(body, chave);

export function parseSaleFinance(body: Record<string, unknown>): SaleFinance {
  const priceTier = isTier(body.price_tier) ? body.price_tier : null;
  const manufacturerRaw = Number(body.manufacturer_id);
  const saleDate = dataValida(body.sale_date);

  let payments: PaymentDb[] | null = null;
  if (Array.isArray(body.payments)) {
    payments = [];
    for (const bruto of body.payments.slice(0, 60)) {
      const p = (bruto ?? {}) as Record<string, unknown>;
      const valor = lerValor(p.amount);
      if (valor === null || valor <= 0) continue; // parcela sem valor é ignorada
      const vencimento = dataValida(p.due_date);
      const recebida = p.received === true || p.status === "recebida";
      const recebidaEm = recebida ? (dataValida(p.received_date) ?? vencimento ?? saleDate) : null;
      // Recebida precisa de data para o banco aceitar; se nada foi informado, usamos a data da venda.
      payments.push({
        due_date: vencimento,
        amount: valor,
        status: recebida && recebidaEm ? "recebida" : "prevista",
        received_date: recebida ? recebidaEm : null,
      });
    }
  }
  // Atacado não tem parcelas: o dinheiro vem como comissão do fabricante (Recebimentos).
  if (priceTier === "atacado") payments = [];

  return {
    priceTier,
    saleCosts: naoNegativo(body.sale_costs),
    paymentFee: naoNegativo(body.payment_fee),
    hasManufacturer: tem(body, "manufacturer_id"),
    manufacturerId: Number.isInteger(manufacturerRaw) && manufacturerRaw > 0 ? manufacturerRaw : null,
    hasStockDate: tem(body, "stock_received_date"),
    stockReceivedDate: dataValida(body.stock_received_date),
    payments,
  };
}

/** Só para mostrar a data do estoque + prazo do fabricante como dica na tela. */
export function expectedCommissionDate(stockDate: string, days: number): string {
  return addDaysISO(stockDate, days);
}

