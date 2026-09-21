import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { parseExpenseBody } from "@/lib/expenses";
import { comoUsuario } from "@/lib/audit";
import { quemFez } from "@/lib/audit-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MENSAGEM_DA_FATURA = "Esta despesa vem de uma fatura do cartão. Para mudar ou apagar, edite a fatura.";

async function veioDeFatura(db: NonNullable<ReturnType<typeof getPool>>, id: number): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM card_invoice_parts WHERE expense_id = $1 LIMIT 1`, [id]);
  return rows.length > 0;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const dados = parseExpenseBody(body);
  if (!dados.ok) return NextResponse.json({ error: dados.error, message: dados.message }, { status: 400 });
  try {
    await ensureSchema();
    if (await veioDeFatura(db, id)) {
      return NextResponse.json({ error: "from_invoice", message: MENSAGEM_DA_FATURA }, { status: 409 });
    }
    const { rowCount } = await comoUsuario(db, await quemFez()).query(
      `UPDATE expenses SET expense_date = $1, description = $2, category = $3, amount = $4, notes = $5 WHERE id = $6`,
      [dados.date, dados.description, dados.category, dados.amount, dados.notes, id]
    );
    if (!rowCount) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    await ensureSchema();
    if (await veioDeFatura(db, id)) {
      return NextResponse.json({ error: "from_invoice", message: MENSAGEM_DA_FATURA }, { status: 409 });
    }
    await comoUsuario(db, await quemFez()).query(`DELETE FROM expenses WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
