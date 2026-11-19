import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, ensureSchema } from "@/lib/db";
import { guardarFoto } from "@/lib/fotos-guardadas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// As fotos ficam no próprio banco do Radar (lib/fotos-guardadas.ts): o depósito da Vercel (Blob) foi bloqueado em 19/11/2026.
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "too_large" }, { status: 400 });
  }

  try {
    const dados = Buffer.from(await file.arrayBuffer());
    const db = getPool();
    if (db) {
      await ensureSchema();
      return NextResponse.json({ url: await guardarFoto(db, dados) }, { status: 201 });
    }
    // Só no computador de desenvolvimento sem banco: guarda a foto em public/uploads-dev (fora do Git).
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "");
    const dir = path.join(process.cwd(), "public", "uploads-dev");
    await mkdir(dir, { recursive: true });
    const local = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await writeFile(path.join(dir, local), dados);
    return NextResponse.json({ url: `${req.nextUrl.origin}/uploads-dev/${local}` }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
