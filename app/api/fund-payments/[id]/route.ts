import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { desfazerPagamento } from "@/lib/fund-db";
import { comoUsuario } from "@/lib/audit";
import { quemFez } from "@/lib/audit-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Desfaz um pagamento do fundo (o valor volta para "falta pagar").
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    await ensureSchema();
    const existia = await desfazerPagamento(comoUsuario(db, await quemFez()), id);
    if (!existia) return NextResponse.json({ error: "not_found", message: "Pagamento não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
