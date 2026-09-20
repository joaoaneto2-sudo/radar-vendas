import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { carregarPecas, carregarVagas, removerCategoria, salvarCategoria } from "@/lib/vitrine-db";
import { validarCategoria } from "@/lib/vitrine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Escolhe a foto de uma categoria (troca a anterior, se houver).
export async function PUT(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  try {
    await ensureSchema();
    const valido = validarCategoria(body, await carregarPecas(db));
    if (!valido.ok) return NextResponse.json({ error: valido.error, message: valido.message }, { status: 400 });
    await salvarCategoria(db, valido.value);
    return NextResponse.json({ vagas: await carregarVagas(db) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}

// Volta ao automático: ?category=Anéis
export async function DELETE(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const categoria = (req.nextUrl.searchParams.get("category") ?? "").trim();
  if (categoria === "") return NextResponse.json({ error: "invalid_category", message: "Categoria inválida." }, { status: 400 });
  try {
    await ensureSchema();
    await removerCategoria(db, categoria);
    return NextResponse.json({ vagas: await carregarVagas(db) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
