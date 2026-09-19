import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { parseReceiptBody } from "@/lib/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIA = (coluna: string) => `to_char(${coluna}, 'YYYY-MM-DD')`;

// Lista tudo o que entra fora do "registrar venda": o livro de recebimentos e as parcelas
// das vendas (recebidas e a receber), juntos, cada linha dizendo de onde veio ("fonte").
export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const [livro, parcelas] = await Promise.all([
      db.query(
        `SELECT r.id, r.kind, r.status, ${DIA("r.received_date")} AS received_date,
                ${DIA("r.expected_date")} AS expected_date, r.amount, r.partner, r.manufacturer_id,
                m.name AS manufacturer_name, r.sale_id, r.from_name, r.from_nickname, r.reason, r.payment_method
           FROM receipts r
           LEFT JOIN manufacturers m ON m.id = r.manufacturer_id`
      ),
      // Comissão de atacado não usa parcelas (vem do livro), então ficam de fora.
      db.query(
        `SELECT sp.id, sp.sale_id, sp.status, ${DIA("sp.received_date")} AS received_date,
                ${DIA("sp.due_date")} AS expected_date, sp.amount, s.client_name, s.payment_method, s.price_tier
           FROM sale_payments sp
           JOIN sales s ON s.id = sp.sale_id
          WHERE s.status = 'ativa' AND s.price_tier <> 'atacado'`
      ),
    ]);

    const items = [
      ...livro.rows.map((r) => ({ source: "livro" as const, ...r })),
      ...parcelas.rows.map((p) => ({
        source: "parcela" as const,
        id: p.id,
        kind: "parcela_venda",
        status: p.status,
        received_date: p.received_date,
        expected_date: p.expected_date,
        amount: p.amount,
        partner: null,
        manufacturer_id: null,
        manufacturer_name: null,
        sale_id: p.sale_id,
        from_name: p.client_name,
        from_nickname: null,
        reason: p.price_tier === "consignado" ? "Parcela de venda consignada" : "Parcela de venda",
        payment_method: p.payment_method,
      })),
    ].sort((a, b) =>
      String(b.received_date ?? b.expected_date ?? "").localeCompare(String(a.received_date ?? a.expected_date ?? "")) ||
      b.id - a.id
    );

    return NextResponse.json({ items });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));

  const dados = parseReceiptBody(body);
  if (!dados.ok) return NextResponse.json({ error: dados.error, message: dados.message }, { status: 400 });

  try {
    await ensureSchema();

    if (dados.kind === "parcela_venda") {
      const { rows } = await db.query(
        `UPDATE sale_payments sp
            SET status = 'recebida', received_date = $1
           FROM sales s
          WHERE sp.id = $2 AND s.id = sp.sale_id AND s.price_tier <> 'atacado'
          RETURNING sp.id`,
        [dados.receivedDate, dados.paymentId]
      );
      if (rows.length === 0) {
        return NextResponse.json(
          { error: "payment_not_found", message: "Não encontrei essa parcela." },
          { status: 404 }
        );
      }
      return NextResponse.json({ item: { source: "parcela", id: rows[0].id } }, { status: 201 });
    }

    const { rows } = await db.query(
      `INSERT INTO receipts (kind, status, received_date, expected_date, amount, partner, manufacturer_id,
                             sale_id, from_name, from_nickname, reason, payment_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
      ]
    );
    return NextResponse.json({ item: { source: "livro", id: rows[0].id } }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string })?.code === "23503") {
      return NextResponse.json(
        { error: "not_found", message: "O fabricante ou a venda escolhida não existe mais." },
        { status: 400 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
