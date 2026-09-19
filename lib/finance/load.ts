import type { Pool } from "pg";
import { toCents } from "./money";
import {
  computeCascade,
  type CascadeResult,
  type JoaoPaymentInput,
  type SaleInput,
  type Settings,
  type Warning,
} from "./cascade";
import {
  computeFund,
  computeLiabilities,
  type FundPaymentInput,
  type FundResult,
  type LiabilitiesResult,
  type LiabilityInput,
  type LiabilityPaymentInput,
  type PurchaseInput,
} from "./accounts";

// Lê o banco e monta os dados para as contas. Datas saem como texto AAAA-MM-DD
// (to_char) para não haver confusão de fuso horário.

export interface FinanceInputs {
  settings: Settings;
  sales: SaleInput[];
  joaoPayments: JoaoPaymentInput[];
  purchases: PurchaseInput[];
  fundPayments: FundPaymentInput[];
  liabilities: LiabilityInput[];
  liabilityPayments: LiabilityPaymentInput[];
}

export interface FinanceSummary {
  settings: Settings;
  cascade: CascadeResult;
  fund: FundResult;
  liabilities: LiabilitiesResult;
  warnings: Warning[];
}

const DIA = (coluna: string) => `to_char(${coluna}, 'YYYY-MM-DD')`;

export async function loadFinanceInputs(db: Pool): Promise<FinanceInputs> {
  const [ajustes, vendas, parcelas, pagJoao, compras, pagFundo, contas, pagContas] = await Promise.all([
    db.query(`SELECT * FROM agreement_settings WHERE id = 1`),
    db.query(
      `SELECT id, ${DIA("sale_date")} AS sale_date, sale_value, sale_costs, payment_fee,
              price_tier, status, payment_method
         FROM sales ORDER BY sale_date, id`
    ),
    db.query(
      `SELECT id, sale_id, ${DIA("due_date")} AS due_date, amount, status,
              ${DIA("received_date")} AS received_date
         FROM sale_payments ORDER BY id`
    ),
    db.query(`SELECT id, ${DIA("paid_date")} AS paid_date, amount FROM joao_payments ORDER BY paid_date, id`),
    db.query(
      `SELECT id, kind, amount, ${DIA("purchase_date")} AS purchase_date, description
         FROM stock_purchases ORDER BY purchase_date NULLS FIRST, id`
    ),
    db.query(`SELECT id, purchase_id, amount, ${DIA("paid_date")} AS paid_date FROM fund_payments ORDER BY id`),
    db.query(
      `SELECT id, description, responsible, total_amount, ${DIA("due_date")} AS due_date
         FROM liabilities ORDER BY id`
    ),
    db.query(
      `SELECT id, liability_id, amount, ${DIA("paid_date")} AS paid_date FROM liability_payments ORDER BY id`
    ),
  ]);

  const a = ajustes.rows[0];
  if (!a) throw new Error("Parâmetros do acordo não encontrados (agreement_settings).");

  const settings: Settings = {
    retailPct: Number(a.retail_replenish_pct),
    wholesalePct: Number(a.wholesale_replenish_pct),
    joaoSharePct: Number(a.joao_share_pct),
    initialStockCents: toCents(a.initial_stock_value),
    mode: a.cascade_mode,
  };

  const parcelasPorVenda = new Map<number, SaleInput["payments"]>();
  for (const p of parcelas.rows) {
    const lista = parcelasPorVenda.get(p.sale_id) ?? [];
    lista.push({
      id: p.id,
      dueDate: p.due_date,
      amountCents: toCents(p.amount),
      status: p.status,
      receivedDate: p.received_date,
    });
    parcelasPorVenda.set(p.sale_id, lista);
  }

  const sales: SaleInput[] = vendas.rows.map((v) => ({
    id: v.id,
    date: v.sale_date,
    amountCents: toCents(v.sale_value),
    costsCents: toCents(v.sale_costs) + toCents(v.payment_fee),
    tier: v.price_tier,
    status: v.status,
    paymentMethod: v.payment_method,
    payments: parcelasPorVenda.get(v.id) ?? [],
  }));

  return {
    settings,
    sales,
    joaoPayments: pagJoao.rows.map((p) => ({ id: p.id, date: p.paid_date, amountCents: toCents(p.amount) })),
    purchases: compras.rows.map((c) => ({
      id: c.id,
      kind: c.kind,
      amountCents: toCents(c.amount),
      date: c.purchase_date,
      description: c.description,
    })),
    fundPayments: pagFundo.rows.map((p) => ({
      id: p.id,
      purchaseId: p.purchase_id,
      amountCents: toCents(p.amount),
      date: p.paid_date,
    })),
    liabilities: contas.rows.map((c) => ({
      id: c.id,
      description: c.description,
      responsible: c.responsible,
      totalCents: toCents(c.total_amount),
      dueDate: c.due_date,
    })),
    liabilityPayments: pagContas.rows.map((p) => ({
      id: p.id,
      liabilityId: p.liability_id,
      amountCents: toCents(p.amount),
      date: p.paid_date,
    })),
  };
}

export function summarize(inputs: FinanceInputs): FinanceSummary {
  const cascade = computeCascade(inputs.settings, inputs.sales, inputs.joaoPayments);
  const fund = computeFund(cascade.totals.replenishCents, inputs.purchases, inputs.fundPayments);
  const liabilities = computeLiabilities(inputs.liabilities, inputs.liabilityPayments);
  return {
    settings: inputs.settings,
    cascade,
    fund,
    liabilities,
    warnings: [...cascade.warnings, ...fund.warnings, ...liabilities.warnings],
  };
}

export async function getFinanceSummary(db: Pool): Promise<FinanceSummary> {
  return summarize(await loadFinanceInputs(db));
}
