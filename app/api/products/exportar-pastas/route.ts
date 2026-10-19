import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Posição do Radar para as pastas: fabricante, nome, código, custo e preço de cada peça nossa (varejo).
// A varredura das pastas (scripts/varrer-pastas.mjs --radar) lê este arquivo para acertar os nomes dos
// arquivos e gerar a planilha do estoque.
export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const { rows } = await db.query(
      `SELECT p.id, m.name AS fabricante, p.name AS nome, p.category AS categoria, p.manufacturer_code AS codigo,
              p.cost AS custo, p.price AS preco, p.stock_qty AS estoque
         FROM products p JOIN manufacturers m ON m.id = p.manufacturer_id
        WHERE p.active AND p.sale_channel IS DISTINCT FROM 'atacado'
        ORDER BY m.name, p.manufacturer_code NULLS LAST, p.name`
    );
    const corpo = {
      geradoEm: new Date().toISOString(),
      pecas: rows.map((r) => ({
        id: r.id,
        fabricante: r.fabricante,
        nome: r.nome,
        categoria: r.categoria,
        codigo: r.codigo,
        custo: r.custo === null ? null : Number(r.custo),
        preco: r.preco === null ? null : Number(r.preco),
        estoque: r.estoque,
      })),
    };
    const dia = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(corpo, null, 1), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="posicao-do-radar-${dia}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
