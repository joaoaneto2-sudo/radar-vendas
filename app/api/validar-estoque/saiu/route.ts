import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { listarQueSairam } from "@/lib/validacao-estoque-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista das peças que saíram do estoque (marcadas com X), baixada como arquivo. O programa das pastas
// (Estoque\Ferramentas\tirar_das_pastas.py) lê este arquivo e move as fotos delas para "Saiu do estoque".
export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const corpo = { geradoEm: new Date().toISOString(), pecas: await listarQueSairam(db) };
    return new NextResponse(JSON.stringify(corpo, null, 1), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="saiu-do-estoque.json"',
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
