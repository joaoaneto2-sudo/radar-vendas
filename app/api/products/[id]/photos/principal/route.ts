import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { reconciliarPeca } from "@/lib/vitrine-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Torna principal uma das fotos extras: ela vira a photo_url da peça e a principal antiga
// ocupa o lugar dela nas extras (a ordem das outras não muda).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (url === "") return NextResponse.json({ error: "invalid_url", message: "Escolha uma foto." }, { status: 400 });

  const client = await db.connect();
  try {
    await ensureSchema();
    await client.query("BEGIN");
    const { rows: peca } = await client.query(`SELECT photo_url FROM products WHERE id = $1 FOR UPDATE`, [id]);
    if (peca.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "not_found", message: "Peça não encontrada." }, { status: 404 });
    }
    const principalAntiga: string | null = peca[0].photo_url;
    if (principalAntiga !== url) {
      const { rows: extra } = await client.query(`SELECT id FROM product_photos WHERE product_id = $1 AND url = $2 LIMIT 1`, [id, url]);
      if (extra.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "photo_not_from_piece", message: "Essa foto não é desta peça." }, { status: 400 });
      }
      await client.query(`UPDATE products SET photo_url = $1 WHERE id = $2`, [url, id]);
      if (principalAntiga) {
        await client.query(`UPDATE product_photos SET url = $1 WHERE id = $2`, [principalAntiga, extra[0].id]);
      } else {
        await client.query(`DELETE FROM product_photos WHERE id = $1`, [extra[0].id]);
      }
    }
    await client.query("COMMIT");
    await reconciliarPeca(db, id);
    const { rows: fotos } = await db.query(`SELECT id, url, position FROM product_photos WHERE product_id = $1 ORDER BY position, id`, [id]);
    return NextResponse.json({ photo_url: url, items: fotos });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
