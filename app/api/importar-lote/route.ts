import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { importarLote, validarLote } from "@/lib/importar-lote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sobe um lote de peças das pastas de fornecedor (com fotos já publicadas em /estoque/...).
// Sem "confirmar": true é só um ensaio, mostra o que seria criado ou atualizado e não grava nada.
export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const conferido = validarLote(body);
  if (!conferido.ok) return NextResponse.json({ error: "invalid_batch", message: conferido.message }, { status: 400 });
  try {
    await ensureSchema();
    const resultado = await importarLote(db, conferido.itens, body.confirmar === true);
    return NextResponse.json(resultado);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "import_failed", message: "Não foi possível importar. Nada foi gravado." }, { status: 500 });
  }
}
