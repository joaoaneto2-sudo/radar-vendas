import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getPool();
  if (!db) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.sale_date) {
    return NextResponse.json({ error: "missing_fields", fields: ["sale_date"] }, { status: 400 });
  }

  const cost =
    body.cost === undefined || body.cost === null || body.cost === "" || Number.isNaN(Number(body.cost))
      ? null
      : Number(body.cost);
  const saleValue =
    body.sale_value === undefined ||
    body.sale_value === null ||
    body.sale_value === "" ||
    Number.isNaN(Number(body.sale_value))
      ? null
      : Number(body.sale_value);

  const installmentsCount =
    body.installments_count === undefined ||
    body.installments_count === null ||
    body.installments_count === ""
      ? null
      : Number(body.installments_count);

  try {
    await ensureSchema();
    const { rows } = await db.query(
      `UPDATE sales SET
        sale_date = $1,
        sale_type = $2,
        seller = $3,
        product_type = $4,
        manufacturer = $5,
        supplier = $6,
        warranty = $7,
        cost = $8,
        sale_value = $9,
        payment_method = $10,
        installments_count = $11,
        installments_dates = $12,
        client_name = $13,
        client_nickname = $14,
        client_city = $15,
        client_phone = $16,
        client_birthday = $17
      WHERE id = $18
      RETURNING *`,
      [
        body.sale_date,
        body.sale_type || null,
        body.seller || null,
        body.product_type || null,
        body.manufacturer || null,
        body.supplier || null,
        body.warranty || null,
        cost,
        saleValue,
        body.payment_method || null,
        installmentsCount,
        body.installments_dates || null,
        body.client_name || null,
        body.client_nickname || null,
        body.client_city || null,
        body.client_phone || null,
        body.client_birthday || null,
        id,
      ]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ sale: rows[0] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getPool();
  if (!db) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  try {
    await ensureSchema();
    const { rowCount } = await db.query("DELETE FROM sales WHERE id = $1", [id]);
    if (rowCount === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
