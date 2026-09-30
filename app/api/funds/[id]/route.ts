import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { comoUsuario } from "@/lib/audit";
import { quemFez } from "@/lib/audit-request";
import { todayBR } from "@/lib/finance/dates";
import { getFinanceSummary } from "@/lib/finance/load";
import { podeArquivar, validarNomeDoFundo } from "@/lib/finance/funds";
import { listarFundos, listarRegras, mudarFundo } from "@/lib/funds-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Renomear, mudar a descrição, arquivar ou reativar um fundo.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));

  const campos: { name?: string; description?: string | null; active?: boolean } = {};
  if (body.name !== undefined || body.description !== undefined) {
    const nome = validarNomeDoFundo(body.name, body.description);
    if (!nome.ok) return NextResponse.json({ error: nome.error, message: nome.message }, { status: 400 });
    campos.name = nome.nome;
    campos.description = nome.descricao;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return NextResponse.json({ error: "invalid_active" }, { status: 400 });
    campos.active = body.active;
  }
  if (Object.keys(campos).length === 0) return NextResponse.json({ error: "nothing_to_change", message: "Nada foi alterado." }, { status: 400 });

  try {
    await ensureSchema();
    if (campos.active === false) {
      const [fundos, regras, resumo] = await Promise.all([listarFundos(db), listarRegras(db), getFinanceSummary(db)]);
      if (!fundos.some((f) => f.id === id)) return NextResponse.json({ error: "not_found", message: "Fundo não encontrado." }, { status: 404 });
      const saldo = resumo.cascade.funds.find((f) => f.fundId === id)?.balanceCents ?? 0;
      const pode = podeArquivar(regras, id, todayBR(), saldo);
      if (!pode.ok) return NextResponse.json({ error: pode.error, message: pode.message }, { status: 409 });
    }
    const achou = await mudarFundo(comoUsuario(db, await quemFez()), id, campos);
    if (!achou) return NextResponse.json({ error: "not_found", message: "Fundo não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return NextResponse.json({ error: "name_taken", message: "Já existe um fundo com esse nome." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
