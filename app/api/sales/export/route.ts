import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getPool, ensureSchema } from "@/lib/db";
import { formatDateBR } from "@/lib/format";
import { PRICE_TIERS, commissionCents } from "@/lib/sale-finance";
import { filterSales, filtersFromParams } from "@/lib/sales-filter";
import { SALE_SELECT } from "@/lib/sales-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = [
  "Data da venda",
  "Tipo de saída",
  "Tipo de venda",
  "Vendedora",
  "Tipo da peça",
  "Fabricante",
  "Fornecedor",
  "Garantia",
  "Custo da peça (R$)",
  "Custos da venda (R$)",
  "Taxa (R$)",
  "Valor da venda (R$)",
  "Lucro (R$)",
  "Forma de pagamento",
  "Parcelas",
  "Datas das parcelas",
  "Nome do cliente",
  "Apelido",
  "Praça",
  "Telefone/WhatsApp",
  "Aniversário",
];

export async function GET(req: NextRequest) {
  const db = getPool();
  if (!db) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  try {
    await ensureSchema();
    const { rows: todas } = await db.query(`${SALE_SELECT} ORDER BY s.sale_date DESC, s.id DESC`);
    // Mesmos filtros da tela do Relatório (período, vendedora, tipo de saída, peça e pagamento).
    const rows = filterSales(todas, filtersFromParams(req.nextUrl.searchParams));

    const data = rows.map((r) => {
      const cost = Number(r.cost) || 0;
      const saleValue = Number(r.sale_value) || 0;
      const atacado = r.price_tier === "atacado";
      // No atacado o cliente paga ao fabricante: o lucro da empresa é a comissão.
      const lucro = atacado
        ? commissionCents(saleValue, r.commission_pct === null ? null : Number(r.commission_pct)) / 100
        : saleValue - cost - (Number(r.sale_costs) || 0) - (Number(r.payment_fee) || 0);
      return [
        formatDateBR(r.sale_date),
        PRICE_TIERS.find((t) => t.value === (r.price_tier ?? "varejo"))?.label ?? "Varejo",
        r.sale_type,
        r.seller,
        r.product_type,
        r.manufacturer || "",
        r.supplier || "",
        r.warranty || "",
        cost,
        Number(r.sale_costs) || 0,
        Number(r.payment_fee) || 0,
        saleValue,
        lucro,
        r.payment_method,
        r.installments_count || "",
        r.installments_dates || "",
        r.client_name,
        r.client_nickname || "",
        r.client_city || "",
        r.client_phone || "",
        r.client_birthday ? formatDateBR(r.client_birthday) : "",
      ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([HEADERS, ...data]);
    worksheet["!cols"] = HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vendas");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="vendas.xlsx"`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
