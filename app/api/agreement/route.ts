import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { dividaDoJoao, validarAcordo } from "@/lib/agreement";
import { lerAcordo, listarHistorico, salvarAcordo } from "@/lib/agreement-db";
import { productPurchaseTotals } from "@/lib/finance/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Parâmetros do acordo. GET: valores de hoje, o estoque inicial apurado pelo cadastro e o histórico.
// PUT: muda um ou mais valores (corpo com as chaves das colunas + confirmar: true).
export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const { valores, cascadeMode } = await lerAcordo(db);
    const [produtos, historico] = await Promise.all([
      db.query(`SELECT to_char(purchase_date, 'YYYY-MM-DD') AS purchase_date, purchase_qty, cost, sale_channel FROM products`),
      listarHistorico(db),
    ]);
    const apurado = productPurchaseTotals(produtos.rows, valores.partnershipStart);
    return NextResponse.json({
      valores,
      cascadeMode,
      dividaCents: dividaDoJoao(valores.initialStockCents, valores.joaoSharePct),
      apurado: {
        cents: apurado.initial.cents,
        pieces: apurado.initial.pieces,
        products: apurado.initial.products,
        semData: apurado.undatedProducts,
        semQuantidade: apurado.withoutQtyProducts,
        semCusto: apurado.withoutCostProducts,
      },
      historico,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  if (body.confirmar !== true) {
    return NextResponse.json({ error: "confirmation_required", message: "Confirme a mudança antes de salvar." }, { status: 400 });
  }
  const sessao = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);

  try {
    await ensureSchema();
    const { valores: atual } = await lerAcordo(db);
    const r = validarAcordo(body, atual);
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: 400 });
    const gravou = await salvarAcordo(db, atual, r.valores, r.mudancas, { id: sessao?.uid ?? null, name: sessao?.name ?? null });
    if (!gravou) {
      return NextResponse.json({ error: "changed_meanwhile", message: "Os valores mudaram enquanto você editava. Recarregue a tela e tente de novo." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, mudancas: r.mudancas });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
