import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const { rows } = await db.query("SELECT * FROM clients ORDER BY full_name ASC");
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
  const fullName = String(body.full_name || "").trim();
  if (!fullName) return NextResponse.json({ error: "missing_full_name" }, { status: 400 });
  try {
    await ensureSchema();
    const { rows } = await db.query(
      `INSERT INTO clients (full_name, nickname, city, phone, birthday)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        fullName,
        body.nickname || null,
        body.city || null,
        body.phone || null,
        body.birthday || null,
      ]
    );
    return NextResponse.json({ item: rows[0] }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
