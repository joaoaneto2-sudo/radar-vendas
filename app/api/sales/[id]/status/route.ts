import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { SALE_SELECT } from "@/lib/sales-query";
import { mudarStatusDaVenda } from "@/lib/sales-status-db";
import { quemFez } from "@/lib/audit-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cancelar ou reativar uma venda: { status: "cancelada" } ou { status: "ativa" }.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (body.status !== "ativa" && body.status !== "cancelada") {
    return NextResponse.json({ error: "invalid_status", message: "O status precisa ser ativa ou cancelada." }, { status: 400 });
  }

  try {
    await ensureSchema();
    const r = await mudarStatusDaVenda(db, id, body.status, await quemFez());
    if (!r.ok) return NextResponse.json({ error: "not_found", message: "Venda não encontrada." }, { status: 404 });
    const { rows } = await db.query(`${SALE_SELECT} WHERE s.id = $1`, [id]);
    return NextResponse.json({ item: rows[0], mudou: r.mudou, recebidoCents: r.recebidoCents });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
