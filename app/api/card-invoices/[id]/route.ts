import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { parseInvoiceBody } from "@/lib/expenses";
import { InvoiceConflict, deleteInvoice, listInvoices, saveInvoice } from "@/lib/invoices-db";
import { marcarQuem } from "@/lib/audit";
import { quemFez } from "@/lib/audit-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const dados = parseInvoiceBody(body);
  if (!dados.ok) return NextResponse.json({ error: dados.error, message: dados.message }, { status: 400 });

  const client = await db.connect();
  try {
    await ensureSchema();
    await client.query("BEGIN");
    await marcarQuem(client, await quemFez());
    await saveInvoice(client, id, dados);
    await client.query("COMMIT");
    const [item] = await listInvoices(db, id);
    return NextResponse.json({ item });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (err instanceof InvoiceConflict) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.code === "not_found" ? 404 : 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const client = await db.connect();
  try {
    await ensureSchema();
    await client.query("BEGIN");
    await marcarQuem(client, await quemFez());
    const apagou = await deleteInvoice(client, id);
    await client.query("COMMIT");
    if (!apagou) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (err instanceof InvoiceConflict) return NextResponse.json({ error: err.code, message: err.message }, { status: 409 });
    console.error(err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
