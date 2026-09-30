import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { lerAcordo } from "@/lib/agreement-db";
import { quemFez } from "@/lib/audit-request";
import { todayBR } from "@/lib/finance/dates";
import { OPCOES_DE_QUANDO, periodoDaOpcao, validarRegra, type OpcaoDeQuando } from "@/lib/finance/funds";
import { criarRegraDeFundo, fundoDisponivel, listarFundos, listarRegras } from "@/lib/funds-db";
import { readMoneyOrNull } from "@/lib/store-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Muda a % de um fundo: { fund_id, pct, quando: "so_este_mes" | "proximo_mes" | "sempre" }.
export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));

  const fundId = Number(body.fund_id);
  if (!Number.isInteger(fundId) || fundId <= 0) {
    return NextResponse.json({ error: "invalid_fund", message: "Escolha o fundo." }, { status: 400 });
  }
  const pct = readMoneyOrNull(body.pct);
  if (pct === null || pct === "invalido") {
    return NextResponse.json({ error: "invalid_pct", message: "Informe a porcentagem (de 0 a 100)." }, { status: 400 });
  }
  if (!OPCOES_DE_QUANDO.includes(body.quando)) {
    return NextResponse.json({ error: "invalid_when", message: "Escolha quando a porcentagem vale." }, { status: 400 });
  }

  try {
    await ensureSchema();
    if (!(await fundoDisponivel(db, fundId))) {
      return NextResponse.json({ error: "invalid_fund", message: "Esse fundo não existe ou está arquivado." }, { status: 400 });
    }
    const periodo = periodoDaOpcao(body.quando as OpcaoDeQuando, todayBR());
    const [regras, fundos, acordo] = await Promise.all([listarRegras(db), listarFundos(db), lerAcordo(db)]);
    const { retailPct, consignmentPct, wholesalePct } = acordo.valores;
    const reposicaoMaxima = Math.max(retailPct, consignmentPct, wholesalePct);
    const v = validarRegra(regras, { fundId, pct, ...periodo }, fundos.map((f) => f.id), reposicaoMaxima);
    if (!v.ok) return NextResponse.json({ error: v.error, message: v.message }, { status: 400 });

    const id = await criarRegraDeFundo(db, { fundId, pct, ...periodo }, await quemFez());
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
