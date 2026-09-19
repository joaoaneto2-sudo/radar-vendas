import { Cents } from "./money";
import type { Warning } from "./cascade";

// Contas do fundo de reposição e do passivo da empresa.

export interface PurchaseInput {
  id: number;
  kind: "inicial" | "reposicao";
  amountCents: Cents;
  date: string | null;
  description: string;
}

export interface FundPaymentInput {
  id: number;
  purchaseId: number;
  amountCents: Cents;
  date: string;
}

export interface FundResult {
  enteredCents: Cents; // reposição separada das vendas
  paidCents: Cents; // já usado para pagar reposições
  balanceCents: Cents; // entrou menos pago
  purchasesTotalCents: Cents; // reposições compradas
  payableCents: Cents; // reposições compradas ainda a pagar
  balanceMinusPayableCents: Cents; // negativo: o fundo ainda não cobre as compras
  initialStockCents: Cents;
  totalStockBoughtCents: Cents; // estoque inicial mais reposições, a custo de compra
  perPurchase: { purchaseId: number; amountCents: Cents; paidCents: Cents; remainingCents: Cents }[];
  warnings: Warning[];
}

export function computeFund(
  enteredCents: Cents,
  purchases: PurchaseInput[],
  fundPayments: FundPaymentInput[]
): FundResult {
  const warnings: Warning[] = [];
  const porCompra = new Map<number, PurchaseInput>(purchases.map((c) => [c.id, c]));

  let pagoTotal = 0;
  const pagoPorCompra = new Map<number, number>();
  for (const pagamento of fundPayments) {
    const compra = porCompra.get(pagamento.purchaseId);
    if (!compra) {
      warnings.push({
        code: "pagamento_de_fundo_sem_compra",
        message: "Há um pagamento do fundo ligado a uma compra que não existe. Ele foi ignorado.",
      });
      continue;
    }
    if (compra.kind !== "reposicao") {
      warnings.push({
        code: "pagamento_de_fundo_em_estoque_inicial",
        message: "O fundo só paga reposições. O pagamento ligado ao estoque inicial foi ignorado.",
      });
      continue;
    }
    pagoTotal += pagamento.amountCents;
    pagoPorCompra.set(compra.id, (pagoPorCompra.get(compra.id) ?? 0) + pagamento.amountCents);
  }

  const reposicoes = purchases.filter((c) => c.kind === "reposicao");
  const purchasesTotalCents = reposicoes.reduce((soma, c) => soma + c.amountCents, 0);
  const initialStockCents = purchases
    .filter((c) => c.kind === "inicial")
    .reduce((soma, c) => soma + c.amountCents, 0);

  const perPurchase = reposicoes.map((c) => {
    const pago = pagoPorCompra.get(c.id) ?? 0;
    if (pago > c.amountCents) {
      warnings.push({
        code: "compra_paga_a_mais",
        message: `A compra "${c.description}" recebeu mais pagamentos do fundo do que o valor dela.`,
      });
    }
    return { purchaseId: c.id, amountCents: c.amountCents, paidCents: pago, remainingCents: c.amountCents - pago };
  });

  const payableCents = purchasesTotalCents - pagoTotal;
  const balanceCents = enteredCents - pagoTotal;

  return {
    enteredCents,
    paidCents: pagoTotal,
    balanceCents,
    purchasesTotalCents,
    payableCents,
    balanceMinusPayableCents: balanceCents - payableCents,
    initialStockCents,
    totalStockBoughtCents: initialStockCents + purchasesTotalCents,
    perPurchase,
    warnings,
  };
}

export interface LiabilityInput {
  id: number;
  description: string;
  responsible: string;
  totalCents: Cents;
  dueDate: string | null;
}

export interface LiabilityPaymentInput {
  id: number;
  liabilityId: number;
  amountCents: Cents;
  date: string;
}

export interface LiabilitiesResult {
  totalCents: Cents;
  paidCents: Cents;
  balanceCents: Cents;
  items: (LiabilityInput & { paidCents: Cents; balanceCents: Cents })[];
  warnings: Warning[];
}

export function computeLiabilities(
  liabilities: LiabilityInput[],
  payments: LiabilityPaymentInput[]
): LiabilitiesResult {
  const warnings: Warning[] = [];
  const conhecidas = new Set(liabilities.map((c) => c.id));
  const pagoPorConta = new Map<number, number>();

  for (const pagamento of payments) {
    if (!conhecidas.has(pagamento.liabilityId)) {
      warnings.push({
        code: "pagamento_de_passivo_sem_conta",
        message: "Há um pagamento ligado a uma conta do passivo que não existe. Ele foi ignorado.",
      });
      continue;
    }
    pagoPorConta.set(
      pagamento.liabilityId,
      (pagoPorConta.get(pagamento.liabilityId) ?? 0) + pagamento.amountCents
    );
  }

  const items = liabilities.map((c) => {
    const pago = pagoPorConta.get(c.id) ?? 0;
    return { ...c, paidCents: pago, balanceCents: c.totalCents - pago };
  });

  const totalCents = items.reduce((soma, c) => soma + c.totalCents, 0);
  const paidCents = items.reduce((soma, c) => soma + c.paidCents, 0);

  return { totalCents, paidCents, balanceCents: totalCents - paidCents, items, warnings };
}
