import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { lerAcordo, marcarComoEstoqueInicial } from "@/lib/agreement-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Marca como estoque inicial (compra na véspera do início da sociedade, 1 unidade) as peças que ainda
// não têm data de compra. Não muda o valor do estoque inicial do acordo: isso continua sendo
// feito à parte, em "Usar o valor apurado" e "Revisar e salvar".
export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  if (body.confirmar !== true) {
    return NextResponse.json({ error: "confirmation_required", message: "Confirme antes de marcar as peças." }, { status: 400 });
  }
  try {
    await ensureSchema();
    const { valores } = await lerAcordo(db);
    const r = await marcarComoEstoqueInicial(db, valores.partnershipStart);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "mark_failed" }, { status: 500 });
  }
}
