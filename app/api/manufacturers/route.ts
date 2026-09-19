import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { parseManufacturerBody } from "@/lib/manufacturers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const { rows } = await db.query("SELECT * FROM manufacturers ORDER BY name ASC");
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

  const dados = parseManufacturerBody(body);
  if (!dados.ok) return NextResponse.json({ error: dados.error, message: dados.message }, { status: 400 });

  try {
    await ensureSchema();
    // Se o nome já existe, atualiza a representação e a comissão em vez de dar erro.
    const { rows } = await db.query(
      `INSERT INTO manufacturers (name, represented, commission_pct, commission_days, wholesale_mode)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE
         SET represented = EXCLUDED.represented,
             commission_pct = EXCLUDED.commission_pct,
             commission_days = EXCLUDED.commission_days,
             wholesale_mode = EXCLUDED.wholesale_mode
       RETURNING *`,
      [dados.name, dados.represented, dados.commissionPct, dados.commissionDays, dados.wholesaleMode]
    );
    return NextResponse.json({ item: rows[0] }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
