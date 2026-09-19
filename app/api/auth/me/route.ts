import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diz quem está logado (o porteiro já barra quem não está, mas conferimos de novo).
export async function GET(req: NextRequest) {
  const sessao = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
  if (!sessao) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ user: { id: sessao.uid, name: sessao.name } });
}
