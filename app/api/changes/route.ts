import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { agruparEventos } from "@/lib/change-log";
import { listarRegistro } from "@/lib/change-log-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Histórico de alterações: as últimas edições e exclusões de vendas, recebimentos, despesas, faturas e pagamentos do fundo.
export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const eventos = agruparEventos(await listarRegistro(db, 600)).slice(0, 200);
    return NextResponse.json({ eventos });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
}
