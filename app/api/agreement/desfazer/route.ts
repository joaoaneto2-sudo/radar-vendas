import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { desfazerUltima } from "@/lib/agreement-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Desfaz a última mudança dos parâmetros do acordo que ainda não foi desfeita.
export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const sessao = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
  try {
    await ensureSchema();
    const r = await desfazerUltima(db, { id: sessao?.uid ?? null, name: sessao?.name ?? null });
    if (!r.ok) {
      const message =
        r.error === "nothing_to_undo"
          ? "Não há mudança para desfazer."
          : "Os valores já foram mudados depois dessa alteração, então ela não pode ser desfeita sozinha.";
      return NextResponse.json({ error: r.error, message }, { status: 409 });
    }
    return NextResponse.json({ ok: true, mudancas: r.mudancas });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "undo_failed" }, { status: 500 });
  }
}
