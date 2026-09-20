import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { carregarPecas, carregarVagas } from "@/lib/vitrine-db";
import { MAX_CARROSSEL } from "@/lib/vitrine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tudo o que a tela "Vitrine do site" precisa: as peças publicadas com as fotos e as vagas escolhidas.
export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const [pecas, vagas] = await Promise.all([carregarPecas(db), carregarVagas(db)]);
    return NextResponse.json({ max: MAX_CARROSSEL, pecas: pecas.filter((p) => p.publicada), vagas });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
