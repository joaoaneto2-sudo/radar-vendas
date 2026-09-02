import { NextRequest, NextResponse } from "next/server";
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
  "Forma de pagamento",
  "Parcelas",
  "Datas das parcelas",
  "Nome do cliente",
  "Apelido",
  "Praça",
  "Telefone/WhatsApp",
  "Aniversário",
];

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",;\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

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

    const lines = [HEADERS.join(";")];
    for (const r of rows) {
      lines.push(
        [
          formatDateBR(r.sale_date),
          r.sale_type,
          r.seller,
          r.product_type,
          r.manufacturer,
          r.supplier,
          r.warranty,
          r.cost,
          r.sale_value,
          r.payment_method,
          r.installments_count,
          r.installments_dates,
          r.client_name,
          r.client_nickname,
          r.client_city,
          r.client_phone,
          r.client_birthday ? formatDateBR(r.client_birthday) : "",
        ]
          .map(csvEscape)
          .join(";")
      );
    }
    const csv = "﻿" + lines.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vendas.csv"`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
