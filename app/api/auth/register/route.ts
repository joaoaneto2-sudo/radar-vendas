import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { registerUser, type RegisterErrorCode } from "@/lib/auth/service";
import { clientIp, readJson, texto, withSessionCookie } from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MENSAGENS: Record<RegisterErrorCode, { status: number; message: string }> = {
  not_configured: { status: 503, message: "O código de convite ainda não foi configurado." },
  locked: { status: 429, message: "Muitas tentativas. Aguarde 15 minutos e tente de novo." },
  invalid_invite: { status: 403, message: "Código de convite incorreto." },
  closed: { status: 403, message: "O cadastro já foi encerrado: os dois usuários já existem." },
  invalid_name: { status: 400, message: "Informe o seu nome." },
  invalid_email: { status: 400, message: "Informe um e-mail válido." },
  weak_password: { status: 400, message: "Escolha uma senha mais forte." },
  email_in_use: { status: 409, message: "Este e-mail já está cadastrado." },
};

export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const dados = await readJson(req);
  const senha = texto(dados.password);
  const repetida = texto(dados.passwordRepeat);
  if (senha !== repetida) {
    return NextResponse.json(
      { error: "password_mismatch", message: "As duas senhas digitadas não são iguais." },
      { status: 400 }
    );
  }

  try {
    await ensureSchema();
    const resultado = await registerUser(
      db,
      {
        name: texto(dados.name),
        email: texto(dados.email),
        password: senha,
        inviteCode: texto(dados.inviteCode),
        ip: clientIp(req),
      },
      { inviteCode: process.env.INVITE_CODE }
    );

    if (!resultado.ok) {
      const info = MENSAGENS[resultado.code];
      return NextResponse.json(
        { error: resultado.code, message: resultado.message ?? info.message },
        { status: info.status }
      );
    }

    return withSessionCookie(NextResponse.json({ ok: true, user: resultado.user }, { status: 201 }), resultado.user);
  } catch (erro) {
    console.error(erro);
    return NextResponse.json({ error: "register_failed", message: "Não foi possível cadastrar agora." }, { status: 500 });
  }
}
