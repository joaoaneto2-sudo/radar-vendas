import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { parseManufacturerBody } from "@/lib/manufacturers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const dados = parseManufacturerBody(body);
  if (!dados.ok) return NextResponse.json({ error: dados.error, message: dados.message }, { status: 400 });

  try {
    await ensureSchema();
    const { rows } = await db.query(
      `UPDATE manufacturers
          SET name = $1, represented = $2, commission_pct = $3, commission_days = $4, wholesale_mode = $5
        WHERE id = $6
        RETURNING *`,
      [dados.name, dados.represented, dados.commissionPct, dados.commissionDays, dados.wholesaleMode, id]
    );
    if (rows.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ item: rows[0] });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return NextResponse.json(
        { error: "name_in_use", message: "Já existe um fabricante com esse nome." },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    await ensureSchema();
    await db.query("DELETE FROM manufacturers WHERE id = $1", [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if ((err as { code?: string })?.code === "23503") {
      return NextResponse.json(
        {
          error: "in_use",
          message: "Este fabricante já tem comissões recebidas lançadas e não pode ser removido.",
        },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
