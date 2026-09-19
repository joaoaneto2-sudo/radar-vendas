import type { Warning } from "./cascade";
import { Cents } from "./money";

// Fatura do cartão da empresa. Cada gasto dela pertence a uma destas partes:
//  - pessoal da Fernanda: ela paga com o dinheiro dela, fica fora da empresa;
//  - estoque inicial (antes de 01/09): a Fernanda paga com o dinheiro dela, é o passivo dela;
//  - reposição (depois de 01/09): paga pelo fundo de reposição;
//  - despesa da empresa: sai do lucro antes da divisão.
// As partes precisam somar o total da fatura.

export type InvoiceNature = "pessoal_fernanda" | "estoque_inicial" | "reposicao" | "despesa_empresa";

export const INVOICE_NATURES: InvoiceNature[] = [
  "pessoal_fernanda",
  "estoque_inicial",
  "reposicao",
  "despesa_empresa",
];

export interface InvoiceInput {
  id: number;
  description: string;
  dueDate: string;
  totalCents: Cents | null; // null enquanto a fatura não fecha
  status: "aguardando_fechamento" | "fechada" | "paga";
}

export interface InvoicePartInput {
  id: number;
  invoiceId: number;
  nature: InvoiceNature;
  amountCents: Cents;
  description?: string | null;
}

export interface InvoiceResult {
  invoiceId: number;
  description: string;
  dueDate: string;
  status: InvoiceInput["status"];
  totalCents: Cents | null;
  partsTotalCents: Cents;
  differenceCents: Cents | null; // total menos partes (0 quando fecha)
  closes: boolean;
  byNature: Record<InvoiceNature, Cents>;
  fernandaPaysCents: Cents; // pessoal mais estoque inicial
  fundPaysCents: Cents; // reposição
  companyExpenseCents: Cents; // despesa da empresa
  warnings: Warning[];
}

export function computeCardInvoice(fatura: InvoiceInput, partes: InvoicePartInput[]): InvoiceResult {
  const minhas = partes.filter((p) => p.invoiceId === fatura.id);
  const porNatureza: Record<InvoiceNature, Cents> = {
    pessoal_fernanda: 0,
    estoque_inicial: 0,
    reposicao: 0,
    despesa_empresa: 0,
  };
  for (const parte of minhas) porNatureza[parte.nature] += parte.amountCents;

  const somaDasPartes = INVOICE_NATURES.reduce((soma, n) => soma + porNatureza[n], 0);
  const warnings: Warning[] = [];
  let diferenca: number | null = null;
  let fecha = false;

  if (fatura.totalCents === null) {
    warnings.push({
      code: "fatura_sem_total",
      message: `A fatura "${fatura.description}" ainda não fechou: sem total não dá para conferir as partes.`,
    });
  } else {
    diferenca = fatura.totalCents - somaDasPartes;
    fecha = diferenca === 0;
    if (!fecha) {
      warnings.push({
        code: "fatura_nao_fecha",
        message: `As partes da fatura "${fatura.description}" não somam o total (diferença de ${diferenca / 100} reais).`,
      });
    }
  }

  return {
    invoiceId: fatura.id,
    description: fatura.description,
    dueDate: fatura.dueDate,
    status: fatura.status,
    totalCents: fatura.totalCents,
    partsTotalCents: somaDasPartes,
    differenceCents: diferenca,
    closes: fecha,
    byNature: porNatureza,
    fernandaPaysCents: porNatureza.pessoal_fernanda + porNatureza.estoque_inicial,
    fundPaysCents: porNatureza.reposicao,
    companyExpenseCents: porNatureza.despesa_empresa,
    warnings,
  };
}
