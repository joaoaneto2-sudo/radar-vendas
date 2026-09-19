import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { parseExpenseBody } from "@/lib/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista as despesas. As que vêm de uma fatura do cartão trazem a fatura de origem
// (invoice_id): essas se editam na própria fatura.
export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const { rows } = await db.query(
      `SELECT e.id, to_char(e.expense_date, 'YYYY-MM-DD') AS expense_date, e.description, e.category,
              e.amount, e.notes, p.invoice_id, ci.description AS invoice_description
         FROM expenses e
         LEFT JOIN card_invoice_parts p ON p.expense_id = e.id
         LEFT JOIN card_invoices ci ON ci.id = p.invoice_id
        ORDER BY e.expense_date DESC, e.id DESC`
    );
    return NextResponse.json({ items: rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const dados = parseExpenseBody(body);
  if (!dados.ok) return NextResponse.json({ error: dados.error, message: dados.message }, { status: 400 });
  try {
    await ensureSchema();
    const { rows } = await db.query(
      `INSERT INTO expenses (expense_date, description, category, amount, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [dados.date, dados.description, dados.category, dados.amount, dados.notes]
    );
    return NextResponse.json({ item: { id: rows[0].id } }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
