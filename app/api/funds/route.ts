import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { lerAcordo } from "@/lib/agreement-db";
import { todayBR } from "@/lib/finance/dates";
import { getFinanceSummary } from "@/lib/finance/load";
import { validarNomeDoFundo } from "@/lib/finance/funds";
import { criarFundo, listarFundos, listarRegras } from "@/lib/funds-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fundos do negócio: a lista com a % do mês, o acumulado, o gasto e o saldo de cada um, e as regras de % por mês.
export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const hoje = todayBR();
    const [fundos, regras, resumo, acordo] = await Promise.all([
      listarFundos(db),
      listarRegras(db),
      getFinanceSummary(db, { today: hoje }),
      lerAcordo(db),
    ]);
    const contas = new Map(resumo.cascade.funds.map((c) => [c.fundId, c]));
    const { retailPct, consignmentPct, wholesalePct } = acordo.valores;
    return NextResponse.json({
      hoje,
      reposicaoMaxima: Math.max(retailPct, consignmentPct, wholesalePct),
      fundos: fundos.map((f) => {
        const c = contas.get(f.id);
        return {
          id: f.id,
          name: f.name,
          description: f.description,
          active: f.active,
          position: f.position,
          pctThisMonth: c?.pctThisMonth ?? 0,
          enteredCents: c?.enteredCents ?? 0,
          spentCents: c?.spentCents ?? 0,
          balanceCents: c?.balanceCents ?? 0,
          enteredThisMonthCents: c?.enteredThisMonthCents ?? 0,
        };
      }),
      regras,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const nome = validarNomeDoFundo(body.name, body.description);
  if (!nome.ok) return NextResponse.json({ error: nome.error, message: nome.message }, { status: 400 });
  try {
    await ensureSchema();
    const id = await criarFundo(db, nome.nome, nome.descricao);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return NextResponse.json({ error: "name_taken", message: "Já existe um fundo com esse nome." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
