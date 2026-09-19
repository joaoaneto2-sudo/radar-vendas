// Desconto e cashback na venda.
//
// - Desconto: o cliente paga menos agora. O valor da venda guardado é o que ele PAGA.
// - Cashback: o cliente paga o valor cheio e ganha, em crédito para as próximas compras, uma
//   porcentagem do que pagou.
// - Usar cashback: o saldo do cliente vira abatimento numa compra nova (vale junto com qualquer um).
// O "valor de tabela" (antes de desconto e cashback usado) fica guardado à parte.
// Nada aqui bloqueia salvar: valor esquisito vira zero e o cashback usado é limitado ao saldo.

import { pctOf } from "./finance/money";
import { centsOrZero } from "./sale-finance";
import { lerValor } from "./receipts";

export type IncentiveKind = "nenhum" | "desconto" | "cashback";

export const INCENTIVE_KINDS: { value: IncentiveKind; label: string }[] = [
  { value: "nenhum", label: "Nenhum" },
  { value: "desconto", label: "Desconto" },
  { value: "cashback", label: "Cashback" },
];

export interface IncentiveInput {
  listValue: string | number | null | undefined; // valor de tabela
  kind: IncentiveKind;
  pct: string | number | null | undefined; // % de desconto ou de cashback
  cashbackUsed?: string | number | null; // saldo que o cliente quer usar (R$)
  availableCents?: number; // saldo do cliente; sem cliente, nada pode ser usado
}

export interface IncentiveResult {
  kind: IncentiveKind;
  pct: number; // 0 quando não há desconto nem cashback
  listCents: number;
  discountCents: number;
  usedCents: number;
  netCents: number; // o que o cliente paga
  earnedCents: number; // cashback que o cliente ganha
}

export function isIncentiveKind(v: unknown): v is IncentiveKind {
  return v === "nenhum" || v === "desconto" || v === "cashback";
}

/** Porcentagem entre 0 e 100, com até 2 casas. Texto inválido vira 0. */
export function readPct(v: unknown): number {
  const n = lerValor(v);
  if (n === null) return 0;
  return Math.round(Math.min(Math.max(n, 0), 100) * 100) / 100;
}

export function computeIncentive(input: IncentiveInput): IncentiveResult {
  const listCents = Math.max(centsOrZero(input.listValue), 0);
  const kind = input.kind;
  const pct = kind === "nenhum" ? 0 : readPct(input.pct);

  const discountCents = kind === "desconto" ? pctOf(listCents, pct) : 0;
  const aposDesconto = listCents - discountCents;

  // Cashback usado: nunca passa do saldo do cliente nem do que ainda falta pagar.
  const pedido = Math.max(centsOrZero(input.cashbackUsed), 0);
  const limite = Math.min(aposDesconto, input.availableCents ?? 0);
  const usedCents = Math.max(Math.min(pedido, limite), 0);

  const netCents = aposDesconto - usedCents;
  const earnedCents = kind === "cashback" ? pctOf(netCents, pct) : 0;

  return { kind, pct, listCents, discountCents, usedCents, netCents, earnedCents };
}

// ---------------------------------------------------------------------------
// Servidor: lê o que veio da tela.

export interface IncentiveBody {
  kind: IncentiveKind;
  pct: number;
  listValue: string | number | null;
  cashbackUsed: string | number | null;
}

/** Só devolve algo se a tela mandou o bloco de desconto/cashback (chave gross_value). */
export function parseIncentiveBody(body: Record<string, unknown>): IncentiveBody | null {
  if (!Object.prototype.hasOwnProperty.call(body, "gross_value")) return null;
  const atacado = body.price_tier === "atacado"; // no atacado o cliente paga ao fabricante
  const kind = atacado ? "nenhum" : isIncentiveKind(body.incentive_kind) ? body.incentive_kind : "nenhum";
  return {
    kind,
    pct: kind === "nenhum" ? 0 : readPct(body.incentive_pct),
    listValue: (body.gross_value as string | number | null) ?? null,
    cashbackUsed: atacado ? null : ((body.cashback_used as string | number | null) ?? null),
  };
}

/** Como o resultado vira colunas da venda. */
export function incentiveToColumns(r: IncentiveResult) {
  const temAjuste = r.kind !== "nenhum" || r.usedCents > 0;
  return {
    saleValue: r.netCents / 100,
    grossValue: temAjuste ? r.listCents / 100 : null,
    discountPct: r.kind === "desconto" ? r.pct : null,
    cashbackPct: r.kind === "cashback" ? r.pct : null,
    cashbackEarned: r.earnedCents / 100,
    cashbackUsed: r.usedCents / 100,
  };
}
