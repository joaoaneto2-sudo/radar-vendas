// Despesas da empresa e faturas do cartão: leitura e conferência do que vem da tela.
// Despesa e parte "despesa da empresa" da fatura saem do lucro ANTES da divisão.
// Regra do cadastro: valor esquisito é recusado com mensagem clara; o resto nunca bloqueia.

import type { InvoiceNature } from "./finance/invoice";
import { readMoneyOrNull } from "./store-rules";

export const EXPENSE_CATEGORIES = ["Marketing", "Embalagem", "Frete", "Taxas", "Aluguel", "Outros"];
export const CARD_EXPENSE_CATEGORY = "Cartão de crédito";

export const NATURE_LABELS: Record<InvoiceNature, string> = {
  pessoal_fernanda: "Pessoal da Fernanda",
  estoque_inicial: "Estoque inicial",
  reposicao: "Reposição",
  despesa_empresa: "Despesa da empresa",
};

export const NATURE_HINTS: Record<InvoiceNature, string> = {
  pessoal_fernanda: "Compras pessoais dela. A Fernanda paga com o dinheiro dela, fica fora da empresa.",
  estoque_inicial: "Joias compradas antes de 01/09. A Fernanda paga com o dinheiro dela (passivo dela).",
  reposicao: "Joias compradas depois de 01/09. Paga pelo fundo de reposição. Vira compra de estoque a pagar.",
  despesa_empresa: "Gasto da empresa. Vira despesa e sai do lucro antes da divisão.",
};

export const INVOICE_STATUS_LABELS = {
  aguardando_fechamento: "Aguardando fechar",
  fechada: "Fechada",
  paga: "Paga",
} as const;

export type InvoiceStatus = keyof typeof INVOICE_STATUS_LABELS;

function dataValida(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const dia = v.slice(0, 10);
  const d = new Date(`${dia}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dia ? null : dia;
}

function texto(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
}

// ---------------------------------------------------------------------------
// Despesa

export type ExpenseBody =
  | { ok: true; date: string; description: string; category: string | null; amount: number; notes: string | null }
  | { ok: false; error: string; message: string };

export function parseExpenseBody(body: Record<string, unknown>): ExpenseBody {
  const date = dataValida(body.expense_date);
  if (!date) return { ok: false, error: "missing_date", message: "Informe a data da despesa." };
  const description = texto(body.description);
  if (!description) return { ok: false, error: "missing_description", message: "Escreva o que foi a despesa." };
  const amount = readMoneyOrNull(body.amount);
  if (amount === null || amount === "invalido" || amount <= 0) {
    return { ok: false, error: "invalid_amount", message: "Informe um valor maior que zero." };
  }
  return { ok: true, date, description, category: texto(body.category), amount, notes: texto(body.notes) };
}

// ---------------------------------------------------------------------------
// Fatura do cartão

export interface InvoicePartBody {
  id: number | null; // parte que já existia (para atualizar no lugar)
  nature: InvoiceNature;
  description: string | null;
  amount: number;
}

export type InvoiceBody =
  | {
      ok: true;
      description: string;
      dueDate: string;
      closingDate: string | null;
      total: number | null; // vazio enquanto a fatura não fecha
      status: InvoiceStatus;
      paidDate: string | null;
      notes: string | null;
      parts: InvoicePartBody[];
    }
  | { ok: false; error: string; message: string };

const NATURES: InvoiceNature[] = ["pessoal_fernanda", "estoque_inicial", "reposicao", "despesa_empresa"];

export function parseInvoiceBody(body: Record<string, unknown>): InvoiceBody {
  const dueDate = dataValida(body.due_date);
  if (!dueDate) return { ok: false, error: "missing_due_date", message: "Informe o vencimento da fatura." };

  const total = readMoneyOrNull(body.total_amount);
  if (total === "invalido" || (total !== null && total < 0)) {
    return { ok: false, error: "invalid_total", message: "O total da fatura precisa ser um valor válido (ou ficar em branco)." };
  }

  let status: InvoiceStatus =
    body.status === "paga" || body.status === "fechada" || body.status === "aguardando_fechamento"
      ? body.status
      : total === null
        ? "aguardando_fechamento"
        : "fechada";
  // Sem total não dá para dizer que fechou.
  if (total === null && status === "fechada") status = "aguardando_fechamento";

  const parts: InvoicePartBody[] = [];
  const bruto = Array.isArray(body.parts) ? body.parts.slice(0, 40) : [];
  for (const item of bruto) {
    const p = (item ?? {}) as Record<string, unknown>;
    const valor = readMoneyOrNull(p.amount);
    if (valor === "invalido") {
      return { ok: false, error: "invalid_part_amount", message: "Uma das partes da fatura tem um valor inválido." };
    }
    if (valor === null || valor <= 0) continue; // parte sem valor é ignorada
    if (!NATURES.includes(p.nature as InvoiceNature)) {
      return { ok: false, error: "invalid_nature", message: "Escolha o tipo de cada parte da fatura." };
    }
    const id = Number(p.id);
    parts.push({
      id: Number.isInteger(id) && id > 0 ? id : null,
      nature: p.nature as InvoiceNature,
      description: texto(p.description),
      amount: valor,
    });
  }

  return {
    ok: true,
    description: texto(body.description) ?? "Fatura do cartão",
    dueDate,
    closingDate: dataValida(body.closing_date),
    total,
    status,
    paidDate: status === "paga" ? (dataValida(body.paid_date) ?? dueDate) : null,
    notes: texto(body.notes),
    parts,
  };
}
