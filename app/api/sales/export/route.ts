import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getPool, ensureSchema } from "@/lib/db";
import { formatDateBR } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = [
  "Data da venda",
  "Tipo de venda",
  "Vendedora",
  "Tipo da peça",
  "Fabricante",
  "Fornecedor",
  "Garantia",
  "Custo (R$)",
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
    const { rows } = await db.query(
      "SELECT * FROM sales ORDER BY sale_date DESC, id DESC"
    );

    const data = rows.map((r) => {
      const cost = Number(r.cost) || 0;
      const saleValue = Number(r.sale_value) || 0;
      return [
        formatDateBR(r.sale_date),
        r.sale_type,
        r.seller,
        r.product_type,
        r.manufacturer || "",
        r.supplier || "",
        r.warranty || "",
        cost,
        saleValue,
        saleValue - cost,
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
