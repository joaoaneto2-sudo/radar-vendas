import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { carregarPecas, carregarVagas, salvarCarrossel } from "@/lib/vitrine-db";
import { validarCarrossel } from "@/lib/vitrine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Troca a lista inteira do carrossel, na ordem enviada.
export async function PUT(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  try {
    await ensureSchema();
    const valido = validarCarrossel(body.items, await carregarPecas(db));
    if (!valido.ok) return NextResponse.json({ error: valido.error, message: valido.message }, { status: 400 });
    await salvarCarrossel(db, valido.value);
    return NextResponse.json({ vagas: await carregarVagas(db) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
