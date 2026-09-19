// Lê e confere os dados de um recebimento vindos da tela.
// Tipos: aporte de sócio, comissão de fabricante, outra receita, e "parcela de venda"
// (que não cria linha nova: marca uma parcela já cadastrada na venda como recebida).

export type ReceiptFormKind = "aporte_socio" | "comissao_fabricante" | "outra_receita" | "parcela_venda";

export const RECEIPT_KIND_LABELS: Record<ReceiptFormKind, string> = {
  aporte_socio: "Aporte de sócio",
  comissao_fabricante: "Comissão de fabricante",
  outra_receita: "Outra receita",
  parcela_venda: "Parcela de venda",
};

export const RECEIPT_PAYMENT_METHODS = ["Pix", "Dinheiro", "Transferência", "Boleto", "Cartão", "Outro"];

export type ReceiptBody =
  | {
      ok: true;
      kind: ReceiptFormKind;
      status: "prevista" | "recebida";
      receivedDate: string | null;
      expectedDate: string | null;
      amount: number | null; // null só na parcela de venda (vale o valor da parcela)
      partner: "joao" | "fernanda" | null;
      manufacturerId: number | null;
      saleId: number | null;
      paymentId: number | null;
      fromName: string | null;
      fromNickname: string | null;
      reason: string | null;
      paymentMethod: string | null;
    }
  | { ok: false; error: string; message: string };

function dataValida(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const dia = v.slice(0, 10);
  const d = new Date(`${dia}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dia ? null : dia;
}

function textoOuNulo(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
}

function inteiroOuNulo(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Aceita 1000, "1000.50" e "1000,50".
export function lerValor(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const texto = v.trim().replace(/\s/g, "");
  const normal = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto;
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function parseReceiptBody(body: Record<string, unknown>): ReceiptBody {
  const kind = body.kind as ReceiptFormKind;
  if (!Object.keys(RECEIPT_KIND_LABELS).includes(kind)) {
    return { ok: false, error: "invalid_kind", message: "Escolha o tipo do recebimento." };
  }

  const fromName = textoOuNulo(body.from_name);
  const fromNickname = textoOuNulo(body.from_nickname);
  const reason = textoOuNulo(body.reason);
  const paymentMethod = textoOuNulo(body.payment_method);
  const partner = body.partner === "joao" || body.partner === "fernanda" ? body.partner : null;
  const manufacturerId = inteiroOuNulo(body.manufacturer_id);
  const saleId = inteiroOuNulo(body.sale_id);
  const paymentId = inteiroOuNulo(body.payment_id);

  // Aporte e parcela de venda são sempre "recebida". Os outros podem ser só um lembrete (prevista).
  const status: "prevista" | "recebida" =
    kind === "aporte_socio" || kind === "parcela_venda" ? "recebida" : body.status === "prevista" ? "prevista" : "recebida";

  const receivedDate = dataValida(body.received_date);
  const expectedDate = dataValida(body.expected_date);

  if (status === "recebida" && !receivedDate) {
    return { ok: false, error: "missing_received_date", message: "Informe a data em que o dinheiro entrou." };
  }

  let amount: number | null = null;
  if (kind === "parcela_venda") {
    if (!paymentId) return { ok: false, error: "missing_payment", message: "Escolha a parcela que foi recebida." };
  } else {
    amount = lerValor(body.amount);
    if (amount === null || amount <= 0) {
      return { ok: false, error: "invalid_amount", message: "Informe um valor maior que zero." };
    }
  }

  if (kind === "aporte_socio" && !partner) {
    return { ok: false, error: "missing_partner", message: "Escolha quem fez o aporte: João ou Fernanda." };
  }
  if (kind === "comissao_fabricante" && !manufacturerId) {
    return { ok: false, error: "missing_manufacturer", message: "Escolha o fabricante que pagou a comissão." };
  }

  return {
    ok: true,
    kind,
    status,
    receivedDate: status === "recebida" ? receivedDate : null,
    expectedDate: status === "prevista" ? expectedDate : null,
    amount,
    partner: kind === "aporte_socio" ? partner : null,
    manufacturerId: kind === "comissao_fabricante" ? manufacturerId : null,
    saleId,
    paymentId: kind === "parcela_venda" ? paymentId : null,
    fromName,
    fromNickname,
    reason,
    paymentMethod,
  };
}
