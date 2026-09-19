import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { parseSaleFinance } from "@/lib/sale-finance";
import { SALE_SELECT, resolveIncentive, savePayments } from "@/lib/sales-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getPool();
  if (!db) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.sale_date) {
    return NextResponse.json({ error: "missing_fields", fields: ["sale_date"] }, { status: 400 });
  }

  const cost =
    body.cost === undefined || body.cost === null || body.cost === "" || Number.isNaN(Number(body.cost))
      ? null
      : Number(body.cost);
  const saleValue =
    body.sale_value === undefined ||
    body.sale_value === null ||
    body.sale_value === "" ||
    Number.isNaN(Number(body.sale_value))
      ? null
      : Number(body.sale_value);

  const installmentsCount =
    body.installments_count === undefined ||
    body.installments_count === null ||
    body.installments_count === ""
      ? null
      : Number(body.installments_count);

  const fin = parseSaleFinance(body);

  const client = await db.connect();
  try {
    await ensureSchema();
    await client.query("BEGIN");
    const atual = await client.query("SELECT client_id, price_tier FROM sales WHERE id = $1", [id]);
    if (atual.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const tierFinal = fin.priceTier ?? atual.rows[0].price_tier;
    // Desconto/cashback: o servidor recalcula o valor que o cliente paga (saldo sem contar esta venda).
    const inc = await resolveIncentive(client, { ...body, price_tier: tierFinal }, atual.rows[0].client_id, id);
    // Tipo, custos e taxa que não vieram na chamada continuam como estão. Fabricante e data do
    // estoque só mudam se a chave veio (mesmo vazia, para poder limpar).
    const { rows } = await client.query(
      `UPDATE sales SET
        sale_date = $1,
        sale_type = $2,
        seller = $3,
        product_type = $4,
        manufacturer = $5,
        supplier = $6,
        warranty = $7,
        cost = $8,
        sale_value = COALESCE($26::numeric, $9::numeric),
        payment_method = $10,
        installments_count = $11,
        installments_dates = $12,
        client_name = $13,
        client_nickname = $14,
        client_city = $15,
        client_phone = $16,
        client_birthday = $17,
        price_tier = COALESCE($19, price_tier),
        sale_costs = COALESCE($20, sale_costs),
        payment_fee = COALESCE($21, payment_fee),
        manufacturer_id = CASE WHEN $22::boolean THEN $23::int ELSE manufacturer_id END,
        stock_received_date = CASE WHEN $24::boolean THEN $25::date ELSE stock_received_date END,
        gross_value = CASE WHEN $27::boolean THEN $28::numeric ELSE gross_value END,
        discount_pct = CASE WHEN $27::boolean THEN $29::numeric ELSE discount_pct END,
        cashback_pct = CASE WHEN $27::boolean THEN $30::numeric ELSE cashback_pct END,
        cashback_earned = CASE WHEN $27::boolean THEN $31::numeric ELSE cashback_earned END,
        cashback_used = CASE WHEN $27::boolean THEN $32::numeric ELSE cashback_used END
      WHERE id = $18
      RETURNING id`,
      [
        body.sale_date,
        body.sale_type || null,
        body.seller || null,
        body.product_type || null,
        body.manufacturer || null,
        body.supplier || null,
        body.warranty || null,
        cost,
        saleValue,
        body.payment_method || null,
        installmentsCount,
        body.installments_dates || null,
        body.client_name || null,
        body.client_nickname || null,
        body.client_city || null,
        body.client_phone || null,
        body.client_birthday || null,
        id,
        fin.priceTier,
        fin.saleCosts,
        fin.paymentFee,
        fin.hasManufacturer,
        fin.manufacturerId,
        fin.hasStockDate,
        fin.stockReceivedDate,
        inc ? inc.saleValue : null,
        inc !== null,
        inc ? inc.grossValue : null,
        inc ? inc.discountPct : null,
        inc ? inc.cashbackPct : null,
        inc ? inc.cashbackEarned : 0,
        inc ? inc.cashbackUsed : 0,
      ]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (fin.payments !== null) await savePayments(client, id, fin.payments);
    await client.query("COMMIT");

    const { rows: completa } = await db.query(`${SALE_SELECT} WHERE s.id = $1`, [id]);
    return NextResponse.json({ sale: completa[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getPool();
  if (!db) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  try {
    await ensureSchema();
    const { rowCount } = await db.query("DELETE FROM sales WHERE id = $1", [id]);
    if (rowCount === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
