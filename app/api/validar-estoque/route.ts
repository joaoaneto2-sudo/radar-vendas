import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { listarParaValidar, marcarValidacao } from "@/lib/validacao-estoque-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tela Validação de Estoque: lista as peças com foto e grava o V (tem), o X (saiu) ou o voltar (null).
export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    return NextResponse.json({ items: await listarParaValidar(db) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const corpo = await req.json().catch(() => null);
  const id = Number(corpo?.id);
  const status = corpo?.status ?? null;
  if (!Number.isInteger(id) || id <= 0 || !(status === null || status === "tem" || status === "saiu")) {
    return NextResponse.json({ error: "invalid_input", message: "Peça ou resposta inválida." }, { status: 400 });
  }
  try {
    await ensureSchema();
    const ok = await marcarValidacao(db, id, status);
    if (!ok) return NextResponse.json({ error: "not_found", message: "Peça não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
