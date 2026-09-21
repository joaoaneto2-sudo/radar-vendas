import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { quemFez } from "@/lib/audit-request";
import { desfazerAlteracao } from "@/lib/change-undo-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Desfaz uma mudança do histórico (o id é o da linha do registro).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    await ensureSchema();
    const r = await desfazerAlteracao(db, id, await quemFez());
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.error === "not_found" ? 404 : 409 });
    return NextResponse.json({ ok: true, titulo: r.titulo });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "undo_failed" }, { status: 500 });
  }
}
