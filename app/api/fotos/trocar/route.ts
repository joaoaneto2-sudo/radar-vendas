import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { trocarFotosQuebradas } from "@/lib/fotos-guardadas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recuperação das fotos que estavam no depósito bloqueado da Vercel: troca o endereço da foto da peça e da modelo
// pelas fotos reenviadas (já guardadas no banco). Só troca foto quebrada; nada mais da peça muda.
export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const corpo = await req.json().catch(() => null);
  const itens = Array.isArray(corpo?.itens) ? corpo.itens : null;
  const valido = (u: unknown) => u === undefined || u === null || (typeof u === "string" && /^\/api\/foto\/\d+$/.test(u));
  if (!itens || itens.length > 100 || !itens.every((i: { id: unknown; foto?: unknown; modelo?: unknown }) => Number.isInteger(i?.id) && valido(i.foto) && valido(i.modelo))) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  try {
    await ensureSchema();
    return NextResponse.json(await trocarFotosQuebradas(db, itens));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
