import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { parseInvoiceBody } from "@/lib/expenses";
import { InvoiceConflict, listInvoices, saveInvoice } from "@/lib/invoices-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    return NextResponse.json({ items: await listInvoices(db) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const dados = parseInvoiceBody(body);
  if (!dados.ok) return NextResponse.json({ error: dados.error, message: dados.message }, { status: 400 });

  const client = await db.connect();
  try {
    await ensureSchema();
    await client.query("BEGIN");
    const id = await saveInvoice(client, null, dados);
    await client.query("COMMIT");
    const [item] = await listInvoices(db, id);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (err instanceof InvoiceConflict) return NextResponse.json({ error: err.code, message: err.message }, { status: 409 });
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
