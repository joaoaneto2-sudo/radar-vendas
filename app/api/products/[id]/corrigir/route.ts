import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { comQuem } from "@/lib/audit";
import { quemFez } from "@/lib/audit-request";
import { aplicarCorrecao, validarCorrecao } from "@/lib/corrigir-peca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Correção rápida pelo alerta: custo, preço de venda ou código. Corpo: { custo?, calcularPreco?, preco?, codigo? }.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const conferido = validarCorrecao(await req.json().catch(() => ({})));
  if (!conferido.ok) return NextResponse.json({ error: "invalid_fix", message: conferido.message }, { status: 400 });
  try {
    await ensureSchema();
    const r = await comQuem(db, await quemFez(), (client) => aplicarCorrecao(client, id, conferido.correcao));
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.error === "not_found" ? 404 : 409 });
    return NextResponse.json({ item: r.item });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "fix_failed", message: "Não foi possível salvar. Tente novamente." }, { status: 500 });
  }
}
