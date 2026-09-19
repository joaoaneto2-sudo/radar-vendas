import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { resolveStoreFields } from "@/lib/store-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liga e desliga "No site" e "Carrossel" direto na lista, sem abrir o cadastro.
// Só mexe nos campos da loja que vieram na chamada.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  // Só estes dois podem ser mudados por aqui.
  const entrada: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(body, "show_online")) entrada.show_online = body.show_online;
  if (Object.prototype.hasOwnProperty.call(body, "featured")) entrada.featured = body.featured;

  try {
    await ensureSchema();
    const { rows: atual } = await db.query(
      `SELECT show_online, featured, sale_price, public_description, sale_channel, price FROM products WHERE id = $1`,
      [id]
    );
    if (atual.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const p = atual[0];

    const r = resolveStoreFields(
      entrada,
      {
        show_online: p.show_online,
        featured: p.featured,
        sale_price: p.sale_price === null ? null : Number(p.sale_price),
        public_description: p.public_description,
      },
      { saleChannel: p.sale_channel, price: p.price === null ? null : Number(p.price) }
    );
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: 400 });

    const { rows } = await db.query(
      `UPDATE products SET show_online = $1, featured = $2 WHERE id = $3
       RETURNING id, show_online, featured, sale_price, public_description`,
      [r.value.show_online, r.value.featured, id]
    );
    return NextResponse.json({ item: rows[0], notes: r.notes });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
