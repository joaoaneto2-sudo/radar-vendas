import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { parseReceiptBody } from "@/lib/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?fonte=parcela: o "recebimento" é uma parcela de venda. Editar muda só as datas e a situação;
// "apagar" não apaga a parcela: ela volta para "a receber".
function ehParcela(req: NextRequest): boolean {
  return req.nextUrl.searchParams.get("fonte") === "parcela";
}

function dia(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));

  try {
    await ensureSchema();

    if (ehParcela(req)) {
      const recebida = body.status !== "prevista";
      const recebimento = dia(body.received_date);
      if (recebida && !recebimento) {
        return NextResponse.json(
          { error: "missing_received_date", message: "Informe a data em que o dinheiro entrou." },
          { status: 400 }
        );
      }
      const { rows } = await db.query(
        `UPDATE sale_payments
            SET status = $1,
                received_date = $2,
                due_date = COALESCE($3::date, due_date)
          WHERE id = $4
          RETURNING id`,
        [recebida ? "recebida" : "prevista", recebida ? recebimento : null, dia(body.expected_date), id]
      );
      if (rows.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    const dados = parseReceiptBody(body);
    if (!dados.ok) return NextResponse.json({ error: dados.error, message: dados.message }, { status: 400 });
    if (dados.kind === "parcela_venda") {
      return NextResponse.json(
        { error: "invalid_kind", message: "Uma parcela de venda se edita pela própria linha da parcela." },
        { status: 400 }
      );
    }

    const { rows } = await db.query(
      `UPDATE receipts
          SET kind=$1, status=$2, received_date=$3, expected_date=$4, amount=$5, partner=$6,
              manufacturer_id=$7, sale_id=$8, from_name=$9, from_nickname=$10, reason=$11, payment_method=$12
        WHERE id=$13
        RETURNING id`,
      [
        dados.kind,
        dados.status,
        dados.receivedDate,
        dados.expectedDate,
        dados.amount,
        dados.partner,
        dados.manufacturerId,
        dados.saleId,
        dados.fromName,
        dados.fromNickname,
        dados.reason,
        dados.paymentMethod,
        id,
      ]
    );
    if (rows.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if ((err as { code?: string })?.code === "23503") {
      return NextResponse.json(
        { error: "not_found", message: "O fabricante ou a venda escolhida não existe mais." },
        { status: 400 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    await ensureSchema();
    if (ehParcela(req)) {
      await db.query(`UPDATE sale_payments SET status = 'prevista', received_date = NULL WHERE id = $1`, [id]);
    } else {
      await db.query(`DELETE FROM receipts WHERE id = $1`, [id]);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
