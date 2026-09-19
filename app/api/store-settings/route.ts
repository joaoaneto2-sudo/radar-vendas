import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { parseStoreSettings } from "@/lib/store-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUNAS = `delivery_salvador, shipping_correios, installment_fee, max_installments, updated_at`;

export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const { rows } = await db.query(`SELECT ${COLUNAS} FROM store_settings WHERE id = 1`);
    return NextResponse.json({ item: rows[0] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const dados = parseStoreSettings(body);
  if (!dados.ok) return NextResponse.json({ error: dados.error, message: dados.message }, { status: 400 });
  try {
    await ensureSchema();
    const { rows } = await db.query(
      `UPDATE store_settings
          SET delivery_salvador = $1, shipping_correios = $2, installment_fee = $3,
              max_installments = $4, updated_at = now()
        WHERE id = 1
        RETURNING ${COLUNAS}`,
      [dados.value.delivery_salvador, dados.value.shipping_correios, dados.value.installment_fee, dados.value.max_installments]
    );
    return NextResponse.json({ item: rows[0] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
