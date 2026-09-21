import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { todayBR } from "@/lib/finance/dates";
import { lerPlanilha } from "@/lib/import-vendas";
import { importarItens, preverImportacao } from "@/lib/import-vendas-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CARACTERES = 100_000;
const MAX_LINHAS = 500;

// Importar vendas e aportes colados da planilha.
// Corpo: { texto, confirmar? }. Sem "confirmar" só mostra a prévia (não grava nada).
export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const texto = typeof body.texto === "string" ? body.texto : "";
  if (texto.trim() === "") {
    return NextResponse.json({ error: "empty", message: "Cole a tabela da planilha na caixa de texto." }, { status: 400 });
  }
  if (texto.length > MAX_CARACTERES || texto.split("\n").length > MAX_LINHAS) {
    return NextResponse.json({ error: "too_big", message: `Cole no máximo ${MAX_LINHAS} linhas de cada vez.` }, { status: 400 });
  }

  const ano = Number(todayBR().slice(0, 4));
  const itens = lerPlanilha(texto, ano);
  if (itens.length === 0) {
    return NextResponse.json({ error: "no_rows", message: "Não encontrei nenhuma linha para importar. Confira se copiou as colunas da planilha." }, { status: 400 });
  }

  try {
    await ensureSchema();
    if (body.confirmar === true) {
      const resultado = await importarItens(db, itens);
      return NextResponse.json({ resultado });
    }
    const previstos = await preverImportacao(db, itens);
    const novos = previstos.filter((p) => p.situacao === "novo");
    return NextResponse.json({
      previstos,
      resumo: {
        novas: novos.length,
        jaExistem: previstos.filter((p) => p.situacao === "ja_existe").length,
        ignoradas: previstos.filter((p) => p.situacao === "ignorada").length,
        clientesNovos: novos.filter((p) => p.clienteNovo).length,
        aportes: novos.filter((p) => p.item.tipo === "aporte").length,
        totalDeVendasCents: novos.reduce((t, p) => t + (p.item.tipo === "venda" ? p.item.valorCents : 0), 0),
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "import_failed", message: "Não foi possível importar. Nada foi gravado. Tente de novo." }, { status: 500 });
  }
}
