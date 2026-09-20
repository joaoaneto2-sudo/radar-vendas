import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { getFinanceSummary } from "@/lib/finance/load";
import { listarComprasDoFundo } from "@/lib/fund-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fundo de reposição: os números (as mesmas contas do painel financeiro) e as compras com os pagamentos.
export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const [resumo, compras] = await Promise.all([getFinanceSummary(db), listarComprasDoFundo(db)]);
    const f = resumo.fund;
    return NextResponse.json({
      fund: {
        enteredCents: f.enteredCents,
        paidCents: f.paidCents,
        balanceCents: f.balanceCents,
        payableCents: f.payableCents,
        balanceMinusPayableCents: f.balanceMinusPayableCents,
      },
      compras,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
