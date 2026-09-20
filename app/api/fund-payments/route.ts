import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { todayBR } from "@/lib/finance/dates";
import { getFinanceSummary } from "@/lib/finance/load";
import { validarPagamentoDoFundo } from "@/lib/fund-payments";
import { listarComprasDoFundo, registrarPagamento } from "@/lib/fund-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Registra quanto o fundo de reposição pagou de uma compra.
// Corpo: { purchase_id, amount, paid_date?, notes? }
export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const compraId = Number(body.purchase_id);
  if (!Number.isInteger(compraId)) {
    return NextResponse.json({ error: "invalid_purchase", message: "Escolha a compra." }, { status: 400 });
  }

  try {
    await ensureSchema();
    const [compras, resumo] = await Promise.all([listarComprasDoFundo(db), getFinanceSummary(db)]);
    const compra = compras.find((c) => c.id === compraId);
    const r = validarPagamentoDoFundo(
      body,
      compra ? { id: compra.id, kind: "reposicao", amountCents: compra.amountCents, paidCents: compra.paidCents } : undefined,
      resumo.fund.balanceCents,
      todayBR()
    );
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: 400 });
    await registrarPagamento(db, r.value);
    return NextResponse.json({ ok: true, avisos: r.avisos }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
