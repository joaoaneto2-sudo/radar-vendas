import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED_FIELDS = [
  "sale_date",
  "sale_type",
  "seller",
  "product_type",
  "cost",
  "sale_value",
  "payment_method",
  "client_name",
] as const;

export async function GET(req: NextRequest) {
  const db = getPool();
  if (!db) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  try {
    await ensureSchema();
    const { rows } = await db.query(
      "SELECT * FROM sales ORDER BY sale_date DESC, id DESC LIMIT 2000"
    );
    return NextResponse.json({ sales: rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const missing = REQUIRED_FIELDS.filter((f) => {
    const v = body[f];
    return v === undefined || v === null || v === "";
  });
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "missing_fields", fields: missing },
      { status: 400 }
    );
  }

  const cost = Number(body.cost);
  const saleValue = Number(body.sale_value);
  if (Number.isNaN(cost) || Number.isNaN(saleValue)) {
    return NextResponse.json({ error: "invalid_numbers" }, { status: 400 });
  }

  const installmentsCount =
    body.installments_count === undefined ||
    body.installments_count === null ||
    body.installments_count === ""
      ? null
      : Number(body.installments_count);

  const productId = body.product_id ? Number(body.product_id) : null;
  const clientId = body.client_id ? Number(body.client_id) : null;
  const sellerId = body.seller_id ? Number(body.seller_id) : null;

  try {
    await ensureSchema();
    const { rows } = await db.query(
      `INSERT INTO sales (
        sale_date, sale_type, seller, product_type, manufacturer, supplier,
        warranty, cost, sale_value, payment_method, installments_count,
        installments_dates, client_name, client_nickname, client_city,
        client_phone, client_birthday, product_id, client_id, seller_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *`,
      [
        body.sale_date,
        body.sale_type,
        body.seller,
        body.product_type,
        body.manufacturer || null,
        body.supplier || null,
        body.warranty || null,
        cost,
        saleValue,
        body.payment_method,
        installmentsCount,
        body.installments_dates || null,
        body.client_name,
        body.client_nickname || null,
        body.client_city || null,
        body.client_phone || null,
        body.client_birthday || null,
        productId,
        clientId,
        sellerId,
      ]
    );
    if (productId) {
      await db.query(
        "UPDATE products SET stock_qty = GREATEST(stock_qty - 1, 0) WHERE id = $1",
        [productId]
      );
    }
    return NextResponse.json({ sale: rows[0] }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
