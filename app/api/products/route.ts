import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT = `
  SELECT p.*, m.name AS manufacturer_name, s.name AS supplier_name
  FROM products p
  LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id
`;

export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const { rows } = await db.query(`${SELECT} ORDER BY p.category, p.name ASC`);
    return NextResponse.json({ items: rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
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
      `INSERT INTO products (
        category, subtype, jewelry_type, name, manufacturer_id, supplier_id,
        cost, price, stock_qty, warranty, photo_url, active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
      ]
    );
    return NextResponse.json({ item: rows[0] }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
