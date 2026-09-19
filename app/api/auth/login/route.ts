import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { loginUser } from "@/lib/auth/service";
import { clientIp, readJson, texto, withSessionCookie } from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const dados = await readJson(req);

  try {
    await ensureSchema();
    const resultado = await loginUser(db, {
      email: texto(dados.email),
      password: texto(dados.password),
      ip: clientIp(req),
    });

    if (!resultado.ok) {
      if (resultado.code === "locked") {
        return NextResponse.json(
          { error: "locked", message: "Muitas tentativas. Aguarde 15 minutos e tente de novo." },
          { status: 429 }
        );
      }
      // Mesma mensagem para e-mail errado e senha errada, de propósito.
      return NextResponse.json(
        { error: "invalid", message: "E-mail ou senha incorretos." },
        { status: 401 }
      );
    }

    return withSessionCookie(NextResponse.json({ ok: true, user: resultado.user }), resultado.user);
  } catch (erro) {
    console.error(erro);
    return NextResponse.json({ error: "login_failed", message: "Não foi possível entrar agora." }, { status: 500 });
  }
}
