import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { resolveCatalogField, resolveStoreFields } from "@/lib/store-rules";
import { MENSAGEM_CARROSSEL_CHEIO, carrosselCheio, reconciliarPeca } from "@/lib/vitrine-db";
import { avisoDeVagasRemovidas } from "@/lib/vitrine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liga e desliga "No site", "Carrossel" e "Catálogo" direto na lista, sem abrir o cadastro.
// Só mexe nos campos que vieram na chamada.
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
  const temCatalogo = Object.prototype.hasOwnProperty.call(body, "show_catalog");

  try {
    await ensureSchema();
    const { rows: atual } = await db.query(
      `SELECT show_online, featured, sale_price, public_description, sale_channel, price, photo_url, show_catalog
         FROM products WHERE id = $1`,
      [id]
    );
    if (atual.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const p = atual[0];

    // "Catálogo" (PDF/consignado) é independente do site: peça de atacado nunca vai (o banco também trava).
    if (temCatalogo && body.show_catalog === true && p.sale_channel === "atacado") {
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

    let showCatalog: boolean = p.show_catalog;
    if (temCatalogo) {
      const rc = resolveCatalogField(body.show_catalog, p.show_catalog, { saleChannel: p.sale_channel });
      if (!rc.ok) return NextResponse.json({ error: rc.error, message: rc.message }, { status: 400 });
      showCatalog = rc.value;
    }

    const { rows } = await db.query(
      `UPDATE products SET show_online = $1, featured = $2, show_catalog = $3 WHERE id = $4
       RETURNING id, show_online, featured, sale_price, public_description, show_catalog`,
      [r.value.show_online, r.value.featured, showCatalog, id]
    );
    const { removidas } = await reconciliarPeca(db, id);
    const aviso = avisoDeVagasRemovidas(removidas);
    return NextResponse.json({
      item: rows[0],
      notes: [...r.notes, ...(aviso ? [aviso] : [])],
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
