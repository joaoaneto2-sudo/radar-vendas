import { addDaysISO } from "./dates";
import type { SaleInput } from "./cascade";
import { Cents, pctOf } from "./money";

// Painel do atacado. No atacado o cliente paga direto ao fabricante e a sociedade
// recebe uma comissão depois: a data prevista é a do recebimento do estoque mais
// o prazo do fabricante (ex.: 15 dias). Aqui só se olha o que é comissão a receber
// e recebida; quem divide o lucro é a cascata.

export type WholesaleStatus = "aguardando_estoque" | "prevista" | "atrasada" | "recebida";

export interface WholesaleItem {
  saleId: number;
  date: string;
  label: string | null;
  grossCents: Cents; // o que o cliente pagou ao fabricante
  commissionCents: Cents; // a parte que fica com a sociedade
  receivedCents: Cents;
  pendingCents: Cents;
  stockReceivedDate: string | null;
  dueDate: string | null; // quando a comissão deve entrar
  status: WholesaleStatus;
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
  items: WholesaleItem[];
}

export interface WholesaleReport {
  grossCents: Cents;
  commissionCents: Cents;
  receivedCents: Cents;
  pendingCents: Cents;
  overdueCents: Cents;
  manufacturers: WholesaleManufacturer[];
  withoutManufacturerSaleIds: number[]; // atacado sem fabricante representado
}

export function computeWholesale(sales: SaleInput[], hoje?: string): WholesaleReport {
  const porFabricante = new Map<string, WholesaleManufacturer>();
  const semFabricante: number[] = [];

  for (const venda of sales) {
    if (venda.status !== "ativa" || venda.tier !== "atacado") continue;
    if (!venda.amountCents || venda.amountCents <= 0) continue;
    if (venda.commissionPct === null || venda.commissionPct === undefined) {
      semFabricante.push(venda.id);
      continue;
    }

    const comissao = pctOf(venda.amountCents, venda.commissionPct);
    const recebido = venda.payments
      .filter((p) => p.status === "recebida")
      .reduce((soma, p) => soma + p.amountCents, 0);
    const pendente = Math.max(0, comissao - recebido);

    // Data prevista: a menor data das parcelas ainda não recebidas; se não houver
    // parcelas com data, a do recebimento do estoque mais o prazo do fabricante.
    const dias = venda.commissionDays ?? 15;
    const datasPrevistas = venda.payments
      .filter((p) => p.status !== "recebida" && p.dueDate)
      .map((p) => p.dueDate as string)
      .sort();
    const dataDoEstoque = venda.stockReceivedDate ?? null;
    const dueDate =
      datasPrevistas[0] ?? (dataDoEstoque ? addDaysISO(dataDoEstoque, dias) : null);

    let status: WholesaleStatus;
    if (comissao > 0 && pendente === 0) status = "recebida";
    else if (!dueDate) status = "aguardando_estoque";
    else if (hoje && dueDate < hoje) status = "atrasada";
    else status = "prevista";

    const chave = String(venda.manufacturerId ?? `nome:${venda.manufacturerName ?? ""}`);
    let grupo = porFabricante.get(chave);
    if (!grupo) {
      grupo = {
        manufacturerId: venda.manufacturerId ?? null,
        name: venda.manufacturerName ?? `Fabricante ${venda.manufacturerId ?? ""}`.trim(),
        commissionPct: venda.commissionPct,
        commissionDays: dias,
        salesCount: 0,
        grossCents: 0,
        commissionCents: 0,
        receivedCents: 0,
        pendingCents: 0,
        overdueCents: 0,
        items: [],
      };
      porFabricante.set(chave, grupo);
    }

    grupo.salesCount += 1;
    grupo.grossCents += venda.amountCents;
    grupo.commissionCents += comissao;
    grupo.receivedCents += Math.min(recebido, comissao);
    grupo.pendingCents += pendente;
    if (status === "atrasada") grupo.overdueCents += pendente;
    grupo.items.push({
      saleId: venda.id,
      date: venda.date,
      label: venda.label ?? null,
      grossCents: venda.amountCents,
      commissionCents: comissao,
      receivedCents: Math.min(recebido, comissao),
      pendingCents: pendente,
      stockReceivedDate: dataDoEstoque,
      dueDate,
      status,
    });
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
    manufacturers: fabricantes,
    withoutManufacturerSaleIds: semFabricante,
  };
}
