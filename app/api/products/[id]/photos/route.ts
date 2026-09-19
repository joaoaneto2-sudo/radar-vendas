import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FOTOS_EXTRAS = 12;

// Fotos extras da peça (a principal continua sendo a photo_url).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    await ensureSchema();
    const { rows } = await db.query(
      `SELECT id, url, position FROM product_photos WHERE product_id = $1 ORDER BY position, id`,
      [id]
    );
    return NextResponse.json({ items: rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "invalid_url", message: "Endereço da foto inválido." }, { status: 400 });
  }
  try {
    await ensureSchema();
    const { rows: contagem } = await db.query(
      `SELECT count(*)::int AS n, COALESCE(max(position), -1) AS ultima FROM product_photos WHERE product_id = $1`,
      [id]
    );
    if (contagem[0].n >= MAX_FOTOS_EXTRAS) {
      return NextResponse.json(
        { error: "too_many", message: `Cada peça pode ter até ${MAX_FOTOS_EXTRAS} fotos extras.` },
        { status: 400 }
      );
    }
    const { rows } = await db.query(
      `INSERT INTO product_photos (product_id, url, position) VALUES ($1, $2, $3) RETURNING id, url, position`,
      [id, url, Number(contagem[0].ultima) + 1]
    );
    return NextResponse.json({ item: rows[0] }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string })?.code === "23503") {
      return NextResponse.json({ error: "not_found", message: "Peça não encontrada." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}

// Reordenar: { order: [idDaFoto, idDaFoto, ...] } na ordem desejada.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const ordem: number[] = Array.isArray(body.order) ? body.order.map(Number).filter(Number.isInteger) : [];
  if (ordem.length === 0) return NextResponse.json({ error: "invalid_order" }, { status: 400 });

  const client = await db.connect();
  try {
    await ensureSchema();
    await client.query("BEGIN");
    for (let i = 0; i < ordem.length; i++) {
      await client.query(`UPDATE product_photos SET position = $1 WHERE id = $2 AND product_id = $3`, [i, ordem[i], id]);
    }
    await client.query("COMMIT");
    const { rows } = await db.query(
      `SELECT id, url, position FROM product_photos WHERE product_id = $1 ORDER BY position, id`,
      [id]
    );
    return NextResponse.json({ items: rows });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

// Remover uma foto extra: ?photoId=12
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  const photoId = Number(req.nextUrl.searchParams.get("photoId"));
  if (!Number.isInteger(id) || !Number.isInteger(photoId)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    await ensureSchema();
    await db.query(`DELETE FROM product_photos WHERE id = $1 AND product_id = $2`, [photoId, id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
