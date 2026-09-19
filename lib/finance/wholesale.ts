import { addDaysISO } from "./dates";
import type { ReceiptInput, SaleInput } from "./cascade";
import { Cents, pctOf } from "./money";

// Painel do atacado. No atacado o cliente paga direto ao fabricante e a sociedade
// recebe uma comissão depois. Não sabemos a data: sabemos quanto vamos receber por fabricante.
//
// - A comissão a receber de cada fabricante é a soma das comissões das vendas dele.
// - O que já entrou vem dos recebimentos de comissão lançados para o fabricante
//   (não são ligados a uma venda só): eles abatem as vendas mais antigas primeiro.
// - A data esperada é um LEMBRETE: a data prevista que o João lançou num recebimento "previsto",
//   ou, se não houver, a do recebimento do estoque mais o prazo do fabricante (ex.: 15 dias).
// Quem divide o lucro é a cascata; aqui só se olha o que é comissão a receber e recebida.

export type WholesaleStatus = "aguardando_estoque" | "prevista" | "atrasada" | "recebida";

export interface WholesaleItem {
  saleId: number;
  date: string;
  label: string | null;
  grossCents: Cents; // o que o cliente pagou ao fabricante
  commissionCents: Cents; // a parte que fica com a sociedade
  receivedCents: Cents; // parte já paga (abatida das vendas mais antigas primeiro)
  pendingCents: Cents;
  stockReceivedDate: string | null;
  dueDate: string | null; // lembrete: quando a comissão deve entrar
  status: WholesaleStatus;
}

export interface WholesaleReminder {
  receiptId: number;
  expectedDate: string | null;
  amountCents: Cents;
  fromName: string | null;
  reason: string | null;
}

export interface WholesaleManufacturer {
  manufacturerId: number | null;
  name: string;
  commissionPct: number;
  commissionDays: number;
  salesCount: number;
  grossCents: Cents;
  commissionCents: Cents;
  receivedCents: Cents;
  pendingCents: Cents;
  overdueCents: Cents;
  excessCents: Cents; // recebido além da comissão das vendas lançadas
  reminders: WholesaleReminder[]; // recebimentos "previstos" lançados à mão
  items: WholesaleItem[];
}

export interface WholesaleReport {
  grossCents: Cents;
  commissionCents: Cents;
  receivedCents: Cents;
  pendingCents: Cents;
  overdueCents: Cents;
  excessCents: Cents;
  manufacturers: WholesaleManufacturer[];
  withoutManufacturerSaleIds: number[]; // atacado sem fabricante representado
}

export function computeWholesale(sales: SaleInput[], hoje?: string, receipts: ReceiptInput[] = []): WholesaleReport {
  const porFabricante = new Map<string, WholesaleManufacturer>();
  const semFabricante: number[] = [];
  const chaveDe = (id: number | null | undefined, nome: string | null | undefined) =>
    String(id ?? `nome:${nome ?? ""}`);

  const grupoDe = (
    id: number | null | undefined,
    nome: string | null | undefined,
    pct: number,
    dias: number
  ): WholesaleManufacturer => {
    const chave = chaveDe(id, nome);
    let grupo = porFabricante.get(chave);
    if (!grupo) {
      grupo = {
        manufacturerId: id ?? null,
        name: nome ?? `Fabricante ${id ?? ""}`.trim(),
        commissionPct: pct,
        commissionDays: dias,
        salesCount: 0,
        grossCents: 0,
        commissionCents: 0,
        receivedCents: 0,
        pendingCents: 0,
        overdueCents: 0,
        excessCents: 0,
        reminders: [],
        items: [],
      };
      porFabricante.set(chave, grupo);
    }
    return grupo;
  };

  for (const venda of sales) {
    if (venda.status !== "ativa" || venda.tier !== "atacado") continue;
    if (!venda.amountCents || venda.amountCents <= 0) continue;
    if (venda.commissionPct === null || venda.commissionPct === undefined) {
      semFabricante.push(venda.id);
      continue;
    }

    const grupo = grupoDe(venda.manufacturerId, venda.manufacturerName, venda.commissionPct, venda.commissionDays ?? 15);
    const comissao = pctOf(venda.amountCents, venda.commissionPct);
    const dias = venda.commissionDays ?? 15;
    const dataDoEstoque = venda.stockReceivedDate ?? null;

    grupo.salesCount += 1;
    grupo.grossCents += venda.amountCents;
    grupo.commissionCents += comissao;
    grupo.items.push({
      saleId: venda.id,
      date: venda.date,
      label: venda.label ?? null,
      grossCents: venda.amountCents,
      commissionCents: comissao,
      receivedCents: 0,
      pendingCents: comissao,
      stockReceivedDate: dataDoEstoque,
      // Lembrete automático; a data lançada à mão (mais abaixo) tem prioridade.
      dueDate: dataDoEstoque ? addDaysISO(dataDoEstoque, dias) : null,
      status: "aguardando_estoque",
    });
  }

  // Recebimentos de comissão, por fabricante.
  const recebidoPor = new Map<string, number>();
  for (const r of receipts) {
    if (r.kind !== "comissao_fabricante") continue;
    const chave = chaveDe(r.manufacturerId, r.manufacturerName);
    if (r.status === "recebida") {
      recebidoPor.set(chave, (recebidoPor.get(chave) ?? 0) + r.amountCents);
      // Fabricante que já pagou mas ainda não tem venda lançada também aparece.
      grupoDe(r.manufacturerId, r.manufacturerName, 0, 15);
    } else {
      grupoDe(r.manufacturerId, r.manufacturerName, 0, 15).reminders.push({
        receiptId: r.id,
        expectedDate: r.expectedDate,
        amountCents: r.amountCents,
        fromName: r.fromName ?? null,
        reason: r.reason ?? null,
      });
    }
  }

  for (const [chave, grupo] of porFabricante) {
    let sobra = recebidoPor.get(chave) ?? 0;
    const lembretes = grupo.reminders
      .map((l) => l.expectedDate)
      .filter((d): d is string => !!d)
      .sort();
    grupo.items.sort((a, b) => a.date.localeCompare(b.date) || a.saleId - b.saleId);

    for (const item of grupo.items) {
      const abatido = Math.min(sobra, item.commissionCents);
      sobra -= abatido;
      item.receivedCents = abatido;
      item.pendingCents = item.commissionCents - abatido;
      if (item.pendingCents > 0 && lembretes[0]) item.dueDate = lembretes[0];

      if (item.commissionCents > 0 && item.pendingCents === 0) item.status = "recebida";
      else if (!item.dueDate) item.status = "aguardando_estoque";
      else if (hoje && item.dueDate < hoje) item.status = "atrasada";
      else item.status = "prevista";

      grupo.receivedCents += abatido;
      grupo.pendingCents += item.pendingCents;
      if (item.status === "atrasada") grupo.overdueCents += item.pendingCents;
    }
    grupo.excessCents = sobra;
    grupo.reminders.sort((a, b) => (a.expectedDate ?? "9999-12-31").localeCompare(b.expectedDate ?? "9999-12-31"));
  }

  const fabricantes = [...porFabricante.values()].sort((a, b) => a.name.localeCompare(b.name));
  const soma = (campo: (f: WholesaleManufacturer) => number) =>
    fabricantes.reduce((total, f) => total + campo(f), 0);

  return {
    grossCents: soma((f) => f.grossCents),
    commissionCents: soma((f) => f.commissionCents),
    receivedCents: soma((f) => f.receivedCents),
    pendingCents: soma((f) => f.pendingCents),
    overdueCents: soma((f) => f.overdueCents),
    excessCents: soma((f) => f.excessCents),
    manufacturers: fabricantes,
    withoutManufacturerSaleIds: semFabricante,
  };
}
