import type { Pool } from "pg";
import { toCents } from "./money";
import { todayBR } from "./dates";
import {
  computeCascade,
  type CascadeResult,
  type ExpenseInput,
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
import { computeWholesale, type WholesaleReport } from "./wholesale";
import {
  computeCardInvoice,
  type InvoiceInput,
  type InvoicePartInput,
  type InvoiceResult,
} from "./invoice";

// Lê o banco e monta os dados para as contas. Datas saem como texto AAAA-MM-DD
// (to_char) para não haver confusão de fuso horário.

export interface FinanceInputs {
  settings: Settings;
  sales: SaleInput[];
  joaoPayments: JoaoPaymentInput[];
  expenses: ExpenseInput[];
  purchases: PurchaseInput[];
  fundPayments: FundPaymentInput[];
  liabilities: LiabilityInput[];
  liabilityPayments: LiabilityPaymentInput[];
  invoices: InvoiceInput[];
  invoiceParts: InvoicePartInput[];
}

export interface FinanceSummary {
  settings: Settings;
  cascade: CascadeResult;
  fund: FundResult;
  liabilities: LiabilitiesResult;
  wholesale: WholesaleReport;
  invoices: InvoiceResult[];
  warnings: Warning[];
}

const DIA = (coluna: string) => `to_char(${coluna}, 'YYYY-MM-DD')`;

export async function loadFinanceInputs(db: Pool): Promise<FinanceInputs> {
  const [ajustes, vendas, parcelas, pagJoao, despesas, compras, pagFundo, contas, pagContas, faturas, partesFatura] =
    await Promise.all([
      db.query(`SELECT * FROM agreement_settings WHERE id = 1`),
      db.query(
        `SELECT s.id, ${DIA("s.sale_date")} AS sale_date, s.sale_value, s.sale_costs, s.payment_fee,
                s.price_tier, s.status, s.payment_method, s.client_name, s.manufacturer_id,
                ${DIA("s.stock_received_date")} AS stock_received_date,
                m.name AS manufacturer_name, m.represented, m.commission_pct, m.commission_days
           FROM sales s
           LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
          ORDER BY s.sale_date, s.id`
      ),
      db.query(
        `SELECT id, sale_id, ${DIA("due_date")} AS due_date, amount, status,
                ${DIA("received_date")} AS received_date
           FROM sale_payments ORDER BY id`
      ),
      db.query(`SELECT id, ${DIA("paid_date")} AS paid_date, amount FROM joao_payments ORDER BY paid_date, id`),
      db.query(`SELECT id, ${DIA("expense_date")} AS expense_date, description, amount FROM expenses ORDER BY expense_date, id`),
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
      db.query(
        `SELECT id, description, ${DIA("due_date")} AS due_date, total_amount, status
           FROM card_invoices ORDER BY due_date, id`
      ),
      db.query(`SELECT id, invoice_id, nature, amount, description FROM card_invoice_parts ORDER BY id`),
    ]);

  const a = ajustes.rows[0];
  if (!a) throw new Error("Parâmetros do acordo não encontrados (agreement_settings).");

  const settings: Settings = {
    retailPct: Number(a.retail_replenish_pct),
    wholesalePct: Number(a.wholesale_replenish_pct),
    consignmentPct: Number(a.consignment_replenish_pct),
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
    label: v.client_name,
    payments: parcelasPorVenda.get(v.id) ?? [],
    manufacturerId: v.manufacturer_id,
    manufacturerName: v.manufacturer_name,
    // Só vale como comissão se o fabricante for um dos representados.
    commissionPct: v.represented && v.commission_pct !== null ? Number(v.commission_pct) : null,
    commissionDays: v.commission_days,
    stockReceivedDate: v.stock_received_date,
  }));

  return {
    settings,
    sales,
    joaoPayments: pagJoao.rows.map((p) => ({ id: p.id, date: p.paid_date, amountCents: toCents(p.amount) })),
    expenses: despesas.rows.map((d) => ({
      id: d.id,
      date: d.expense_date,
      amountCents: toCents(d.amount),
      description: d.description,
    })),
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
    invoices: faturas.rows.map((f) => ({
      id: f.id,
      description: f.description,
      dueDate: f.due_date,
      totalCents: f.total_amount === null ? null : toCents(f.total_amount),
      status: f.status,
    })),
    invoiceParts: partesFatura.rows.map((p) => ({
      id: p.id,
      invoiceId: p.invoice_id,
      nature: p.nature,
      amountCents: toCents(p.amount),
      description: p.description,
    })),
  };
}

export function summarize(inputs: FinanceInputs, opcoes: { today?: string } = {}): FinanceSummary {
  const hoje = opcoes.today ?? todayBR();
  const cascade = computeCascade(inputs.settings, inputs.sales, inputs.joaoPayments, inputs.expenses);
  const fund = computeFund(cascade.totals.replenishCents, inputs.purchases, inputs.fundPayments);
  const liabilities = computeLiabilities(inputs.liabilities, inputs.liabilityPayments);
  const wholesale = computeWholesale(inputs.sales, hoje);
  const invoices = inputs.invoices.map((f) => computeCardInvoice(f, inputs.invoiceParts));
  return {
    settings: inputs.settings,
    cascade,
    fund,
    liabilities,
    wholesale,
    invoices,
    warnings: [
      ...cascade.warnings,
      ...fund.warnings,
      ...liabilities.warnings,
      ...invoices.flatMap((f) => f.warnings),
    ],
  };
}

export async function getFinanceSummary(db: Pool, opcoes: { today?: string } = {}): Promise<FinanceSummary> {
  return summarize(await loadFinanceInputs(db), opcoes);
}
