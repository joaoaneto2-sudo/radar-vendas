import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { parseSaleFinance } from "@/lib/sale-finance";
import { SALE_SELECT, resolveIncentive, savePayments } from "@/lib/sales-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getPool();
  if (!db) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  try {
    await ensureSchema();
    const { rows } = await db.query(`${SALE_SELECT} ORDER BY s.sale_date DESC, s.id DESC LIMIT 2000`);
    return NextResponse.json({ sales: rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
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

  const productId = body.product_id ? Number(body.product_id) : null;
  const clientId = body.client_id ? Number(body.client_id) : null;
  const sellerId = body.seller_id ? Number(body.seller_id) : null;
  const fin = parseSaleFinance(body);
  const tier = fin.priceTier ?? "varejo";

  const client = await db.connect();
  try {
    await ensureSchema();
    await client.query("BEGIN");
    // Desconto/cashback: o servidor recalcula o valor que o cliente paga.
    const inc = await resolveIncentive(client, { ...body, price_tier: tier }, clientId, null);
    const { rows } = await client.query(
      `INSERT INTO sales (
        sale_date, sale_type, seller, product_type, manufacturer, supplier,
        warranty, cost, sale_value, payment_method, installments_count,
        installments_dates, client_name, client_nickname, client_city,
        client_phone, client_birthday, product_id, client_id, seller_id,
        price_tier, sale_costs, payment_fee, manufacturer_id, stock_received_date,
        gross_value, discount_pct, cashback_pct, cashback_earned, cashback_used
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
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
        inc ? inc.saleValue : saleValue,
        body.payment_method || null,
        installmentsCount,
        body.installments_dates || null,
        body.client_name || null,
        body.client_nickname || null,
        body.client_city || null,
        body.client_phone || null,
        body.client_birthday || null,
        productId,
        clientId,
        sellerId,
        tier,
        fin.saleCosts ?? 0,
        fin.paymentFee ?? 0,
        fin.manufacturerId,
        fin.stockReceivedDate,
        inc ? inc.grossValue : null,
        inc ? inc.discountPct : null,
        inc ? inc.cashbackPct : null,
        inc ? inc.cashbackEarned : 0,
        inc ? inc.cashbackUsed : 0,
      ]
    );
    const saleId = rows[0].id as number;
    if (fin.payments && fin.payments.length > 0) await savePayments(client, saleId, fin.payments);
    // Peça de atacado é do fabricante: não sai do nosso estoque.
    if (productId && tier !== "atacado") {
      await client.query("UPDATE products SET stock_qty = GREATEST(stock_qty - 1, 0) WHERE id = $1", [productId]);
    }
    await client.query("COMMIT");

    const { rows: completa } = await db.query(`${SALE_SELECT} WHERE s.id = $1`, [saleId]);
    return NextResponse.json({ sale: completa[0] }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
