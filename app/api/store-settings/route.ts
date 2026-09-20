import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { STORE_SETTING_KEYS, parseStoreSettings, rowsToSettings, settingsToRows } from "@/lib/store-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAVES = Object.values(STORE_SETTING_KEYS);

// A loja lê a tabela store_settings (chave e valor em texto). Aqui a tela trabalha com os
// quatro campos; chave ausente significa "a loja usa o padrão dela".
export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const { rows } = await db.query(`SELECT key, value FROM store_settings WHERE key = ANY($1::text[])`, [CHAVES]);
    return NextResponse.json({ item: rowsToSettings(rows) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const dados = parseStoreSettings(body);
  if (!dados.ok) return NextResponse.json({ error: dados.error, message: dados.message }, { status: 400 });

  const client = await db.connect();
  try {
    await ensureSchema();
    await client.query("BEGIN");
    for (const linha of settingsToRows(dados.value)) {
      if (linha.value === null) {
        // Em branco: a chave sai, e a loja usa o padrão dela (nunca zero).
        await client.query(`DELETE FROM store_settings WHERE key = $1`, [linha.key]);
      } else {
        await client.query(
          `INSERT INTO store_settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [linha.key, linha.value]
        );
      }
    }
    await client.query("COMMIT");
    const { rows } = await db.query(`SELECT key, value FROM store_settings WHERE key = ANY($1::text[])`, [CHAVES]);
    return NextResponse.json({ item: rowsToSettings(rows) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
