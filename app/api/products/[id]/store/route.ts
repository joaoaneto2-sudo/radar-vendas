import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { resolveStoreFields } from "@/lib/store-rules";
import { MENSAGEM_CARROSSEL_CHEIO, carrosselCheio, reconciliarPeca } from "@/lib/vitrine-db";
import { avisoDeVagasRemovidas } from "@/lib/vitrine";
import { mudarNoCatalogo } from "@/lib/catalog-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liga e desliga "No site", "Carrossel" e "Catálogo" direto na lista, sem abrir o cadastro.
// Só mexe nos campos da loja que vieram na chamada.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  // Só estes campos podem ser mudados por aqui.
  const entrada: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(body, "show_online")) entrada.show_online = body.show_online;
  if (Object.prototype.hasOwnProperty.call(body, "featured")) entrada.featured = body.featured;
  const mexeuNoCatalogo = Object.prototype.hasOwnProperty.call(body, "show_catalog");

  try {
    await ensureSchema();
    const { rows: atual } = await db.query(
      `SELECT show_online, featured, sale_price, public_description, sale_channel, price, photo_url FROM products WHERE id = $1`,
      [id]
    );
    if (atual.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const p = atual[0];

    // "Catálogo" (PDF/consignado) é independente do site: peça de atacado nunca vai (o banco também trava).
    if (mexeuNoCatalogo && body.show_catalog === true && p.sale_channel === "atacado") {
      return NextResponse.json(
        { error: "wholesale_not_allowed", message: "Peça do fabricante (atacado) não vai para o catálogo." },
        { status: 400 }
      );
    }

    const r = resolveStoreFields(
      entrada,
      {
        show_online: p.show_online,
        featured: p.featured,
        sale_price: p.sale_price === null ? null : Number(p.sale_price),
        public_description: p.public_description,
      },
      { saleChannel: p.sale_channel, price: p.price === null ? null : Number(p.price), photoUrl: p.photo_url }
    );
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: 400 });
    if (r.value.featured && (await carrosselCheio(db, id))) {
      return NextResponse.json({ error: "carousel_full", message: MENSAGEM_CARROSSEL_CHEIO }, { status: 400 });
    }

    const { rows } = await db.query(
      `UPDATE products SET show_online = $1, featured = $2 WHERE id = $3
       RETURNING id, show_online, featured, sale_price, public_description`,
      [r.value.show_online, r.value.featured, id]
    );
    if (mexeuNoCatalogo) await mudarNoCatalogo(db, id, { showCatalog: body.show_catalog === true });
    const { removidas } = await reconciliarPeca(db, id);
    const aviso = avisoDeVagasRemovidas(removidas);
    const { rows: comCatalogo } = await db.query(`SELECT show_catalog FROM products WHERE id = $1`, [id]);
    return NextResponse.json({
      item: { ...rows[0], show_catalog: comCatalogo[0]?.show_catalog ?? false },
      notes: [...r.notes, ...(aviso ? [aviso] : [])],
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
