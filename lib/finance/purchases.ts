import { Cents, toCents } from "./money";

// Fases do negócio, pela DATA DA COMPRA da peça:
//  - antes de 01/09: estoque inicial (a Fernanda paga as faturas dessas compras);
//  - de 01/09 em diante (inclusive): estoque da sociedade (50% de cada).
// A data de início da sociedade fica em Parâmetros.

export type PurchasePhase = "inicial" | "posterior" | "sem_data";

export function purchasePhase(data: string | null | undefined, inicioDaSociedade: string): PurchasePhase {
  if (!data) return "sem_data";
  return data.slice(0, 10) < inicioDaSociedade ? "inicial" : "posterior";
}

export interface PurchaseProduct {
  id?: number;
  cost?: string | number | null;
  purchase_qty?: number | null;
  purchase_date?: string | null;
  sale_channel?: string | null; // "atacado" = peça do fabricante, não é compra nossa
}

export interface PhaseTotals {
  cents: Cents; // custo x quantidade comprada
  pieces: number; // peças compradas
  products: number; // quantos cadastros
}

export interface PurchaseTotals {
  initial: PhaseTotals; // compras antes do início da sociedade
  posterior: PhaseTotals; // compras a partir do início da sociedade
  undatedProducts: number; // sem data da compra: ficam fora das duas fases
  withoutQtyProducts: number; // com data mas sem quantidade comprada (contam zero)
  withoutCostProducts: number; // com data mas sem custo (contam zero)
}

export function productPurchaseTotals(produtos: PurchaseProduct[], inicioDaSociedade: string): PurchaseTotals {
  const totais: PurchaseTotals = {
    initial: { cents: 0, pieces: 0, products: 0 },
    posterior: { cents: 0, pieces: 0, products: 0 },
    undatedProducts: 0,
    withoutQtyProducts: 0,
    withoutCostProducts: 0,
  };

  for (const p of produtos) {
    // Peça de atacado é do fabricante (pronta entrega): não foi comprada por nós.
    if (p.sale_channel === "atacado") continue;
    const fase = purchasePhase(p.purchase_date, inicioDaSociedade);
    if (fase === "sem_data") {
      totais.undatedProducts += 1;
      continue;
    }

    const quantidade = p.purchase_qty ?? 0;
    const custo = p.cost === null || p.cost === undefined || p.cost === "" ? null : toCents(p.cost);
    if (p.purchase_qty === null || p.purchase_qty === undefined) totais.withoutQtyProducts += 1;
    if (custo === null) totais.withoutCostProducts += 1;

    const alvo = fase === "inicial" ? totais.initial : totais.posterior;
    alvo.cents += (custo ?? 0) * quantidade;
    alvo.pieces += quantidade;
    alvo.products += 1;
  }

  return totais;
}
