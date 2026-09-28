import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { comoUsuario } from "@/lib/audit";
import { quemFez } from "@/lib/audit-request";
import { apagarRegraDeFundo } from "@/lib/funds-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Apaga uma regra de %: a regra anterior volta a valer nos meses em comum. Fica no histórico de alterações.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    await ensureSchema();
    const apagou = await apagarRegraDeFundo(comoUsuario(db, await quemFez()), id);
    if (!apagou) return NextResponse.json({ error: "not_found", message: "Regra não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
