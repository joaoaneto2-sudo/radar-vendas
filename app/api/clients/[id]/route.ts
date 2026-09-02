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
  const fullName = String(body.full_name || "").trim();
  if (!fullName) return NextResponse.json({ error: "missing_full_name" }, { status: 400 });
  try {
    await ensureSchema();
    const { rows } = await db.query(
      `UPDATE clients SET full_name=$1, nickname=$2, city=$3, phone=$4, birthday=$5
       WHERE id=$6 RETURNING *`,
      [
        fullName,
        body.nickname || null,
        body.city || null,
        body.phone || null,
        body.birthday || null,
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
    await db.query("DELETE FROM clients WHERE id = $1", [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
