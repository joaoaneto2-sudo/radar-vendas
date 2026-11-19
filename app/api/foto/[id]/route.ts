import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { lerFoto } from "@/lib/fotos-guardadas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Foto guardada no banco (veja lib/fotos-guardadas.ts). Uma foto nunca muda depois de guardada: o navegador pode guardá-la.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const foto = await lerFoto(db, id);
    if (!foto) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return new NextResponse(new Uint8Array(foto.conteudo), {
      headers: {
        "Content-Type": foto.tipo,
        "Content-Length": String(foto.conteudo.length),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
