import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { tokenDaIntegracaoValido } from "@/lib/auth/integration-token";
import { gravarComissaoDoWhatsapp } from "@/lib/comissao-whatsapp-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// O Roberto manda aqui cada mensagem do grupo com a comissão paga às funcionárias
// ("Comissão de hoje 40 + 15 + 7=62"). Corpo: { message_id, text, sent_at (ISO), origin }.
// A comissão vira despesa do dia da mensagem e é descontada do caixa na meta dos cartões.

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
  if (!messageId || messageId.length > 200 || !texto || texto.length > 5000) {
    return NextResponse.json({ error: "missing_fields", fields: ["message_id", "text"] }, { status: 400 });
  }

  try {
    await ensureSchema();
    const r = await gravarComissaoDoWhatsapp(db, {
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
