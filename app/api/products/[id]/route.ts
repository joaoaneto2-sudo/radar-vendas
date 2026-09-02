import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const required = ["category", "subtype", "jewelry_type", "name"];
  const missing = required.filter((f) => !String(body[f] || "").trim());
  if (missing.length > 0) {
    return NextResponse.json({ error: "missing_fields", fields: missing }, { status: 400 });
  }

  const cost = Number(body.cost) || 0;
  const price = Number(body.price) || 0;
  const stockQty = Number.isFinite(Number(body.stock_qty)) ? Number(body.stock_qty) : 0;

  try {
    await ensureSchema();
    const { rows } = await db.query(
      `UPDATE products SET
        category=$1, subtype=$2, jewelry_type=$3, name=$4, manufacturer_id=$5,
        supplier_id=$6, cost=$7, price=$8, stock_qty=$9, warranty=$10,
        photo_url=$11, active=$12
      WHERE id=$13
      RETURNING *`,
      [
        body.category,
        body.subtype,
        body.jewelry_type,
        body.name,
        body.manufacturer_id || null,
        body.supplier_id || null,
        cost,
        price,
        stockQty,
        body.warranty || null,
        body.photo_url || null,
        body.active !== false,
        id,
      ]
    );
    if (rows.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ item: rows[0] });
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
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    await ensureSchema();
    await db.query("DELETE FROM products WHERE id = $1", [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
