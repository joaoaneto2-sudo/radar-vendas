import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { resolveStoreFields } from "@/lib/store-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function intOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  return n === null ? null : Math.max(0, Math.trunc(n));
}

function dateOrNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const cost = numOrNull(body.cost);
  const price = numOrNull(body.price);
  const stockQty = Number.isFinite(Number(body.stock_qty)) ? Number(body.stock_qty) : 0;
  const saleChannel = body.sale_channel === "atacado" ? "atacado" : "varejo";

  try {
    await ensureSchema();

    // Regras da loja online: chaves que não vieram mantêm o que a peça já tem.
    const atual = await db.query(
      `SELECT show_online, featured, sale_price, public_description FROM products WHERE id = $1`,
      [id]
    );
    if (atual.rows.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const antes = atual.rows[0];
    const loja = resolveStoreFields(
      body,
      {
        show_online: antes.show_online,
        featured: antes.featured,
        sale_price: antes.sale_price === null ? null : Number(antes.sale_price),
        public_description: antes.public_description,
      },
      { saleChannel, price, photoUrl: body.photo_url || null }
    );
    if (!loja.ok) return NextResponse.json({ error: loja.error, message: loja.message }, { status: 400 });

    const { rows } = await db.query(
      `UPDATE products SET
        category=$1, subtype=$2, jewelry_type=$3, name=$4, manufacturer_id=$5,
        supplier_id=$6, cost=$7, price=$8, stock_qty=$9, warranty=$10,
        photo_url=$11, active=$12, material=$13, gemstone=$14, age_group=$15, gender=$16,
        karat=$17, purchase_date=$18, purchase_payment_method=$19, purchase_qty=$20,
        sale_channel=$21, show_online=$22, featured=$23, sale_price=$24, public_description=$25
      WHERE id=$26
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
        saleChannel,
        loja.value.show_online,
        loja.value.featured,
        loja.value.sale_price,
        loja.value.public_description,
        id,
      ]
    );
    if (rows.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ item: rows[0], notes: loja.notes });
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
