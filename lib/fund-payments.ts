import { Cents, centsToDecimalString, formatCentsBRL, toCents } from "./finance/money";
import { readMoneyOrNull } from "./store-rules";

// Pagamentos do fundo de reposição: o fundo (30% das vendas de varejo e consignado) paga as compras
// de reposição. Aqui ficam só as regras (sem banco) de um pagamento novo.

export interface CompraDoFundo {
  id: number;
  kind: string; // "reposicao" ou "inicial"
  amountCents: Cents;
  paidCents: Cents; // o que o fundo já pagou desta compra
}

export type PagamentoValido = { purchaseId: number; amount: string; paidDate: string; notes: string | null };

export type ResultadoDoPagamento =
  | { ok: true; value: PagamentoValido; avisos: string[] }
  | { ok: false; error: string; message: string };

const erro = (error: string, message: string) => ({ ok: false as const, error, message });

function dataValida(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Confere um pagamento do fundo. Recusa o que não faz sentido (compra que não existe, estoque inicial,
 * valor vazio, zero, acima do que falta pagar, data futura). Se o fundo não tem esse dinheiro separado,
 * deixa registrar mas devolve um aviso (o João pode ter pago de outro jeito e estar só lançando).
 */
export function validarPagamentoDoFundo(
  entrada: Record<string, unknown>,
  compra: CompraDoFundo | undefined,
  saldoDoFundoCents: Cents,
  hoje: string
): ResultadoDoPagamento {
  if (!compra) return erro("purchase_not_found", "Não encontrei essa compra.");
  if (compra.kind !== "reposicao") return erro("only_replenishment", "O fundo só paga reposições, não o estoque inicial.");

  const valor = readMoneyOrNull(entrada.amount);
  if (valor === "invalido") return erro("invalid_amount", "O valor não é válido.");
  if (valor === null) return erro("missing_amount", "Informe o valor pago pelo fundo.");
  if (valor <= 0) return erro("invalid_amount", "O valor precisa ser maior que zero.");

  const centavos = toCents(valor);
  const falta = compra.amountCents - compra.paidCents;
  if (centavos > falta) {
    return erro("over_remaining", `O valor passa do que falta pagar desta compra (${formatCentsBRL(Math.max(falta, 0))}).`);
  }

  const data = entrada.paid_date === undefined || entrada.paid_date === "" ? hoje : entrada.paid_date;
  if (!dataValida(data)) return erro("invalid_date", "A data do pagamento não é válida.");
  if (data > hoje) return erro("future_date", "A data do pagamento não pode ser no futuro.");

  const avisos: string[] = [];
  if (centavos > saldoDoFundoCents) {
    avisos.push(
      `O fundo tem só ${formatCentsBRL(Math.max(saldoDoFundoCents, 0))} separado. Este pagamento deixa o saldo em ${formatCentsBRL(saldoDoFundoCents - centavos)}.`
    );
  }

  const nota = typeof entrada.notes === "string" ? entrada.notes.trim() : "";
  return {
    ok: true,
    value: { purchaseId: compra.id, amount: centsToDecimalString(centavos), paidDate: data, notes: nota === "" ? null : nota },
    avisos,
  };
}
