import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  // Só no computador de desenvolvimento, sem a chave do armazenamento: guarda a foto em public/uploads-dev (fora do Git).
  const semArmazenamento = !process.env.BLOB_READ_WRITE_TOKEN;
  if (semArmazenamento && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "blob_not_configured" }, { status: 503 });
  }

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
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `produtos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    if (semArmazenamento) {
      const dir = path.join(process.cwd(), "public", "uploads-dev");
      await mkdir(dir, { recursive: true });
      const local = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext.replace(/[^a-z0-9]/gi, "")}`;
      await writeFile(path.join(dir, local), Buffer.from(await file.arrayBuffer()));
      return NextResponse.json({ url: `${req.nextUrl.origin}/uploads-dev/${local}` }, { status: 201 });
    }
    const blob = await put(filename, file, { access: "public" });
    return NextResponse.json({ url: blob.url }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
