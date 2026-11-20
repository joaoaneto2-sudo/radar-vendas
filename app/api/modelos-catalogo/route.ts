import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { apagarModelo, listarModelos, problemaDoModelo, salvarModelo, type NovoModelo } from "@/lib/modelos-catalogo-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Catálogos montados pela Fernanda (tela Montar Catálogo) e abertos pelo João no Criar catálogo.
export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    return NextResponse.json({ items: await listarModelos(db) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const corpo = await req.json().catch(() => null);
  const problema = problemaDoModelo(corpo);
  if (problema) return NextResponse.json({ error: "invalid_input", message: problema }, { status: 400 });
  try {
    await ensureSchema();
    const sessao = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
    const id = await salvarModelo(db, corpo as NovoModelo, sessao?.name ?? null);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    await ensureSchema();
    return (await apagarModelo(db, id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
