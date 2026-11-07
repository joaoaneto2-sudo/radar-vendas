import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { tokenDaIntegracaoValido } from "@/lib/auth/integration-token";
import { gravarVendaDoWhatsapp } from "@/lib/venda-whatsapp-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// O Roberto manda aqui cada mensagem "🚀 VENDA REALIZADA" que aparece no WhatsApp.
// Corpo: { message_id, text, sent_at (ISO), origin }. Responde o que foi feito com a mensagem.

export async function POST(req: NextRequest) {
  if (!tokenDaIntegracaoValido(req.headers.get("authorization"), process.env.ROBERTO_INTEGRATION_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const messageId = typeof body.message_id === "string" ? body.message_id.trim() : "";
  const texto = typeof body.text === "string" ? body.text : "";
  const enviadaEm = typeof body.sent_at === "string" ? body.sent_at : new Date().toISOString();
  if (!messageId || messageId.length > 200 || !texto || texto.length > 10000) {
    return NextResponse.json({ error: "missing_fields", fields: ["message_id", "text"] }, { status: 400 });
  }

  try {
    await ensureSchema();
    const r = await gravarVendaDoWhatsapp(db, {
      messageId,
      texto,
      enviadaEm,
      origem: typeof body.origin === "string" ? body.origin.slice(0, 200) : null,
    });
    return NextResponse.json(r, { status: r.situacao === "gravada" ? 201 : 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
