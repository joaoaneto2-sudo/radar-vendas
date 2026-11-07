import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { tokenDaIntegracaoValido } from "@/lib/auth/integration-token";
import { todayBR } from "@/lib/finance/dates";
import { montarRelatorioDoDia } from "@/lib/relatorio-do-dia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// O Roberto busca aqui, no fim do dia, o texto do relatório para postar no grupo.
// GET ?dia=AAAA-MM-DD (opcional; padrão: hoje em Brasília). Responde { dia, texto }.

export async function GET(req: NextRequest) {
  if (!tokenDaIntegracaoValido(req.headers.get("authorization"), process.env.ROBERTO_INTEGRATION_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const pedido = req.nextUrl.searchParams.get("dia");
  const dia = pedido && /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : todayBR();

  try {
    await ensureSchema();
    const [vendas, aReceber, despesas, partes, recebidas, comissoes, clientes, ultima] = await Promise.all([
      db.query(
        `SELECT to_char(s.sale_date, 'YYYY-MM-DD') AS sale_date, s.sale_value, s.price_tier, s.status,
                s.payment_method, s.seller, s.product_type, s.client_name, s.client_id, s.cost, s.supplier,
                pr.name AS product_name,
                CASE WHEN m.represented THEN m.commission_pct END AS commission_pct
           FROM sales s LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
           LEFT JOIN products pr ON pr.id = s.product_id`
      ),
      db.query(
        `SELECT to_char(p.due_date, 'YYYY-MM-DD') AS due_date, p.amount, s.client_name
           FROM sale_payments p JOIN sales s ON s.id = p.sale_id
          WHERE p.status = 'prevista' AND s.status = 'ativa' AND s.price_tier <> 'atacado'`
      ),
      db.query(
        `SELECT to_char(expense_date, 'YYYY-MM-DD') AS expense_date, amount,
                NOT EXISTS (SELECT 1 FROM card_invoice_parts cp WHERE cp.expense_id = expenses.id) AS avulsa
           FROM expenses`
      ),
      db.query(
        `SELECT to_char(i.due_date, 'YYYY-MM-DD') AS due_date, i.status, p.nature, p.amount
           FROM card_invoices i JOIN card_invoice_parts p ON p.invoice_id = i.id`
      ),
      db.query(
        `SELECT to_char(p.received_date, 'YYYY-MM-DD') AS date, p.amount
           FROM sale_payments p JOIN sales s ON s.id = p.sale_id
          WHERE p.status = 'recebida' AND p.received_date IS NOT NULL AND s.status = 'ativa'
            AND COALESCE(s.price_tier, 'varejo') <> 'atacado'`
      ),
      db.query(
        `SELECT to_char(received_date, 'YYYY-MM-DD') AS date, amount
           FROM receipts
          WHERE kind = 'comissao_fabricante' AND status = 'recebida' AND received_date IS NOT NULL`
      ),
      db.query(
        `SELECT id, full_name, phone, city, to_char(birthday, 'YYYY-MM-DD') AS birthday FROM clients`
      ),
      // Última mensagem de venda que o Roberto lançou (gravada ou reconhecida como repetida).
      db.query(
        `SELECT w.enviada_em, s.client_name
           FROM vendas_whatsapp w LEFT JOIN sales s ON s.id = w.sale_id
          WHERE w.situacao IN ('gravada', 'ja_existe') AND w.enviada_em IS NOT NULL
          ORDER BY w.enviada_em DESC LIMIT 1`
      ),
    ]);
    const u = ultima.rows[0];

    const texto = montarRelatorioDoDia({
      dia,
      vendas: vendas.rows,
      aReceber: aReceber.rows,
      meta: {
        hoje: dia,
        partes: partes.rows,
        despesas: despesas.rows,
        vendas: vendas.rows,
        entradas: [...recebidas.rows, ...comissoes.rows],
      },
      clientes: clientes.rows,
      geradoEm: new Date().toISOString(),
      ultimaVendaLida: u
        ? { postadaEm: new Date(u.enviada_em).toISOString(), cliente: u.client_name ?? null }
        : null,
    });
    return NextResponse.json({ dia, texto });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
