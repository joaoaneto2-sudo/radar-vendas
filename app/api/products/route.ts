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

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function intOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  return n === null ? null : Math.max(0, Math.trunc(n));
}

// Aceita AAAA-MM-DD; qualquer outra coisa vira "sem data".
function dateOrNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const { rows } = await db.query(`${SELECT} ORDER BY p.created_at DESC`);
    // A data de início da sociedade separa as duas fases do estoque.
    const { rows: ajustes } = await db.query(
      `SELECT to_char(partnership_start, 'YYYY-MM-DD') AS partnership_start FROM agreement_settings WHERE id = 1`
    );
    return NextResponse.json({
      items: rows,
      partnershipStart: ajustes[0]?.partnership_start ?? "2026-09-01",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));

  const cost = numOrNull(body.cost);
  const price = numOrNull(body.price);
  const stockQty = Number.isFinite(Number(body.stock_qty)) ? Number(body.stock_qty) : 0;

  try {
    await ensureSchema();
    const { rows } = await db.query(
      `INSERT INTO products (
        category, subtype, jewelry_type, name, manufacturer_id, supplier_id,
        cost, price, stock_qty, warranty, photo_url, active,
        material, gemstone, age_group, gender, karat,
        purchase_date, purchase_payment_method, purchase_qty, sale_channel
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING *`,
      [
        body.category || null,
        body.subtype || null,
        body.jewelry_type || null,
        body.name || null,
        body.manufacturer_id || null,
        body.supplier_id || null,
        cost,
        price,
        stockQty,
        body.warranty || null,
        body.photo_url || null,
        body.active !== false,
        body.material || null,
        body.gemstone || null,
        body.age_group || null,
        body.gender || null,
        body.karat || null,
        dateOrNull(body.purchase_date),
        body.purchase_payment_method || null,
        intOrNull(body.purchase_qty),
        body.sale_channel === "atacado" ? "atacado" : "varejo",
      ]
    );
    return NextResponse.json({ item: rows[0] }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
