import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { getPool, ensureSchema } from "@/lib/db";
import { tokenDaIntegracaoValido } from "@/lib/auth/integration-token";
import { todayBR } from "@/lib/finance/dates";
import { dadosDaArte } from "@/lib/arte-do-relatorio";
import { ArteDoFechamento } from "@/lib/arte-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Arte (PNG 1080x1350) que o Roberto posta no grupo junto com o texto do relatório do dia.
// GET ?dia=AAAA-MM-DD (opcional; padrão: hoje em Brasília). Mesmo token da rota do relatório.

const MARCA = path.join(process.cwd(), "public", "marca");

async function comoDataUrl(arquivo: string, tipo: string): Promise<string | null> {
  try {
    return `data:${tipo};base64,${(await readFile(path.join(MARCA, arquivo))).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!tokenDaIntegracaoValido(req.headers.get("authorization"), process.env.ROBERTO_INTEGRATION_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const pedido = req.nextUrl.searchParams.get("dia");
  const dia = pedido && /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : todayBR();

  await ensureSchema();
  const vendas = await db.query(
    `SELECT to_char(sale_date, 'YYYY-MM-DD') AS sale_date, sale_value, price_tier, status FROM sales`
  );
  const d = dadosDaArte(vendas.rows, dia);

  const [logo, couro, serif, sans, sansBold, display] = await Promise.all([
    comoDataUrl("logo-clara.png", "image/png"),
    comoDataUrl("couro.jpg", "image/jpeg"),
    readFile(path.join(MARCA, "fontes", "InstrumentSerif-Regular.ttf")),
    readFile(path.join(MARCA, "fontes", "InstrumentSans-Regular.ttf")),
    readFile(path.join(MARCA, "fontes", "InstrumentSans-Bold.ttf")),
    readFile(path.join(MARCA, "fontes", "Italiana-Regular.ttf")),
  ]);

  return new ImageResponse(<ArteDoFechamento d={d} logo={logo} couro={couro} />, {
    width: 1080,
    height: 1350,
    fonts: [
      { name: "Instrument Serif", data: serif, weight: 400, style: "normal" },
      { name: "Instrument Sans", data: sans, weight: 400, style: "normal" },
      { name: "Instrument Sans", data: sansBold, weight: 700, style: "normal" },
      { name: "Italiana", data: display, weight: 400, style: "normal" },
    ],
  });
}
