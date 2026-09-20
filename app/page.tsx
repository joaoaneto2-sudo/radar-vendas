import { getPool, ensureSchema } from "@/lib/db";
import { formatCentsBRL, toCents } from "@/lib/finance/money";
import { todayBR } from "@/lib/finance/dates";
import { getFinanceSummary } from "@/lib/finance/load";
import {
  PERIODOS,
  comissaoDoAtacado,
  parsePeriodo,
  periodRange,
  porcentagem,
  primeiros,
  receberPorSemana,
  receitaDaEmpresa,
  somarPor,
  ticketMedio,
  totalPorDiaDaSemana,
  valorVendido,
  vendasDoPeriodo,
  vendidoPorTempo,
  type Parte,
  type ParcelaLinha,
  type VendaLinha,
} from "@/lib/dashboard";
import { NAO_INFORMADA } from "@/lib/sale-finance";
import { acumuladoDoMes, comparativoAteHoje, resumoMensal, ritmoDoMes, tendenciaDasVendas, type DadosDaMeta } from "@/lib/meta-mensal";
import MetaDoMes from "./meta-do-mes";
import { BarraDupla, BarrasHorizontais, BarrasVerticais, CORES, Progresso, Quadro, Rosca } from "./charts";

export const dynamic = "force-dynamic";

const reais = formatCentsBRL;
const ROTULO_DA_SAIDA: Record<string, string> = { varejo: "Varejo", atacado: "Atacado (comissão)", consignado: "Consignado" };

function Numero({ rotulo, valor, nota, tom }: { rotulo: string; valor: string; nota?: string; tom?: "accent" | "gold" | "danger" }) {
  return (
    <div className={"stat-tile" + (tom ? ` ${tom}` : "")}>
      <div className="label">{rotulo}</div>
      <div className="value">{valor}</div>
      {nota && <div className="stat-note">{nota}</div>}
    </div>
  );
}

export default async function VisaoGeralPage({ searchParams }: { searchParams: { periodo?: string } }) {
  const db = getPool();
  if (!db) {
    return (
      <main className="shell shell--wide">
        <div className="banner banner-warning">
          <span>⚠️</span>
          <span>O banco de dados ainda não foi conectado a este projeto.</span>
        </div>
      </main>
    );
  }

  await ensureSchema();
  const hoje = todayBR();
  const periodo = parsePeriodo(searchParams.periodo);
  const intervalo = periodRange(periodo, hoje);

  const [vendasRes, despesasRes, parcelasRes, produtosRes, resumo, partesRes, recebidasRes, comissoesRes] = await Promise.all([
    db.query(
      `SELECT to_char(s.sale_date, 'YYYY-MM-DD') AS sale_date, s.sale_value, s.price_tier, s.status,
              s.payment_method, s.seller, s.product_type, s.client_name,
              CASE WHEN m.represented THEN m.commission_pct END AS commission_pct
         FROM sales s LEFT JOIN manufacturers m ON m.id = s.manufacturer_id`
    ),
    db.query(
      `SELECT to_char(expense_date, 'YYYY-MM-DD') AS expense_date, category, amount,
              NOT EXISTS (SELECT 1 FROM card_invoice_parts cp WHERE cp.expense_id = expenses.id) AS avulsa
         FROM expenses`
    ),
    db.query(
      `SELECT to_char(p.due_date, 'YYYY-MM-DD') AS due_date, p.amount
         FROM sale_payments p JOIN sales s ON s.id = p.sale_id
        WHERE p.status = 'prevista' AND s.status = 'ativa' AND s.price_tier <> 'atacado'`
    ),
    db.query(`SELECT category, stock_qty, show_online, sale_channel, active FROM products WHERE active`),
    getFinanceSummary(db),
    // Meta do mês: partes das faturas do cartão, e o dinheiro que já entrou (parcelas recebidas e comissões)
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
  ]);

  const todas = vendasRes.rows as VendaLinha[];
  const doPeriodo = vendasDoPeriodo(todas, intervalo);
  const vendas = doPeriodo.filter((v) => v.price_tier !== "atacado");

  // Números do topo
  const faturamento = doPeriodo.reduce((t, v) => t + valorVendido(v), 0);
  const comissaoPeriodo = doPeriodo.reduce((t, v) => t + comissaoDoAtacado(v), 0);
  const { cascade, fund, wholesale } = resumo;

  // A receber: parcelas previstas das vendas + comissão de atacado ainda não paga
  const parcelas: ParcelaLinha[] = parcelasRes.rows.map((p) => ({ due_date: p.due_date, amount: p.amount }));
  for (const f of wholesale.manufacturers) {
    for (const item of f.items) {
      if (item.pendingCents > 0) parcelas.push({ due_date: item.dueDate, amount: item.pendingCents / 100 });
    }
  }
  const totalAReceber = parcelas.reduce((t, p) => t + toCents(p.amount), 0);

  // Gráficos de vendas
  const aoLongoDoTempo = vendidoPorTempo(todas, periodo, intervalo);
  const porSaida = somarPor(doPeriodo, (v) => ROTULO_DA_SAIDA[v.price_tier ?? "varejo"], receitaDaEmpresa);
  const porPagamento = somarPor(vendas, (v) => v.payment_method, valorVendido, NAO_INFORMADA);
  const porVendedora = primeiros(somarPor(vendas, (v) => v.seller, valorVendido, "Sem vendedora"), 6);
  const porPeca = primeiros(somarPor(vendas, (v) => v.product_type, valorVendido, "Sem peça informada"), 6);
  const porCliente = primeiros(somarPor(vendas, (v) => v.client_name, valorVendido, "Sem nome"), 6, "Outros clientes");
  const porDiaDaSemana = totalPorDiaDaSemana(vendas);

  // Despesas do período por categoria
  const despesasDoPeriodo = despesasRes.rows.filter((d) => (intervalo.from === null || d.expense_date >= intervalo.from) && d.expense_date <= intervalo.to);
  const despesasPorCategoria = somarPor(despesasDoPeriodo, (d) => d.category, (d) => toCents(d.amount), "Sem categoria");
  const totalDespesas = despesasDoPeriodo.reduce((t, d) => t + toCents(d.amount), 0);

  // Estoque (peças ativas) por categoria
  const estoque = new Map<string, number>();
  let pecasNoSite = 0;
  let estoqueBaixo = 0;
  for (const p of produtosRes.rows) {
    const categoria = (p.category as string | null) || "Sem categoria";
    estoque.set(categoria, (estoque.get(categoria) ?? 0) + Number(p.stock_qty ?? 0));
    if (p.show_online) pecasNoSite += 1;
    if (p.sale_channel !== "atacado" && Number(p.stock_qty ?? 0) <= 2) estoqueBaixo += 1;
  }
  const estoquePorCategoria: Parte[] = [...estoque.entries()]
    .map(([rotulo, quantidade]) => ({ rotulo, cents: 0, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);

  const semana = receberPorSemana(parcelas, hoje, 6);

  // Meta do mês (não depende do período escolhido no alto)
  const dadosDaMeta: DadosDaMeta = {
    hoje,
    partes: partesRes.rows,
    despesas: despesasRes.rows.map((d) => ({ expense_date: d.expense_date, amount: d.amount, avulsa: d.avulsa })),
    vendas: todas,
    entradas: [...recebidasRes.rows, ...comissoesRes.rows],
  };
  const ticketDoMes = ticketMedio(vendasDoPeriodo(todas, periodRange("mes", hoje)));
  const ritmo = ritmoDoMes(dadosDaMeta, ticketDoMes);
  const dividaTotal = cascade.debt.totalCents;

  return (
    <main className="shell shell--wide">
      <div className="page-head page-head--row">
        <div>
          <p className="eyebrow">Início</p>
          <h1>Visão geral</h1>
          <p>Como a loja está indo: vendas, dinheiro a receber, atacado, estoque e a divisão entre vocês.</p>
        </div>
        <nav className="tabs" aria-label="Período">
          {PERIODOS.map((p) => (
            <a key={p.valor} href={p.valor === "mes" ? "/" : `/?periodo=${p.valor}`} className={"tab-btn" + (periodo === p.valor ? " active" : "")}>
              {p.rotulo}
            </a>
          ))}
        </nav>
      </div>

      <MetaDoMes
        ritmo={ritmo}
        resumo={resumoMensal(dadosDaMeta)}
        acumulado={acumuladoDoMes(dadosDaMeta, ritmo)}
        comparativo={comparativoAteHoje(dadosDaMeta)}
        tendencia={tendenciaDasVendas(todas, hoje)}
        ticketMedio={ticketDoMes}
      />

      <h2 className="dash-section">Vendas e movimento do período</h2>

      <div className="stat-grid auto dash-kpis">
        <Numero rotulo="Vendido" valor={reais(faturamento)} nota="Varejo e consignado, no período" tom="accent" />
        <Numero rotulo="Vendas" valor={String(vendas.length)} nota={doPeriodo.length > vendas.length ? `Mais ${doPeriodo.length - vendas.length} de atacado` : "No período"} />
        <Numero rotulo="Ticket médio" valor={reais(ticketMedio(vendas))} nota="Por venda de varejo e consignado" />
        <Numero rotulo="Comissão do atacado" valor={reais(comissaoPeriodo)} nota="Prevista, no período" tom="gold" />
        <Numero rotulo="Lucro dividido" valor={reais(cascade.totals.distributableCents)} nota="Desde o início" tom="gold" />
        <Numero rotulo="A receber" valor={reais(totalAReceber)} nota="Parcelas e comissões" tom={totalAReceber > 0 ? "danger" : undefined} />
      </div>

      <div className="dash-grid">
        <Quadro titulo="Vendido ao longo do tempo" nota={periodo === "ano" || periodo === "tudo" ? "por mês" : "por dia"} largo>
          <BarrasVerticais pontos={aoLongoDoTempo} descricao="Valor vendido ao longo do tempo" largo />
        </Quadro>

        <Quadro titulo="Receita por tipo de saída" nota="atacado = comissão">
          <Rosca partes={porSaida} centro={reais(porSaida.reduce((t, p) => t + p.cents, 0))} descricao="Receita por tipo de saída" />
        </Quadro>

        <Quadro titulo="Formas de pagamento">
          <BarrasHorizontais partes={primeiros(porPagamento, 6)} />
        </Quadro>

        <Quadro titulo="Vendas por vendedora">
          <BarrasHorizontais partes={porVendedora} />
        </Quadro>

        <Quadro titulo="Peças mais vendidas">
          <BarrasHorizontais partes={porPeca} />
        </Quadro>

        <Quadro titulo="Vendas por dia da semana">
          <BarrasVerticais pontos={porDiaDaSemana} cor={CORES[1]} descricao="Valor vendido em cada dia da semana" />
        </Quadro>

        <Quadro titulo="Melhores clientes">
          <BarrasHorizontais partes={porCliente} />
        </Quadro>

        <Quadro titulo="Dinheiro a receber por semana" nota="parcelas e comissões" largo>
          <BarrasVerticais pontos={semana} cor={CORES[2]} descricao="Dinheiro a receber por semana" largo />
        </Quadro>

        <Quadro titulo="Atacado por fabricante" nota="comissão recebida e a receber">
          {wholesale.manufacturers.length === 0 ? (
            <div className="dash-empty">Sem vendas de atacado ainda.</div>
          ) : (
            wholesale.manufacturers.map((f) => (
              <BarraDupla
                key={f.manufacturerId ?? f.name}
                rotulo={f.name}
                a={f.receivedCents}
                b={f.pendingCents}
                rotuloA="Recebida"
                rotuloB="A receber"
              />
            ))
          )}
        </Quadro>

        <Quadro titulo="Dívida do estoque inicial" nota="do João com a Fernanda">
          <Progresso
            titulo="Quitado"
            fracao={cascade.debt.paidFraction}
            detalhe={`Faltam ${reais(cascade.debt.balanceCents)} de ${reais(dividaTotal)}`}
          />
          <div className="mini-stats">
            <div>
              <span>Pago direto</span>
              <strong>{reais(cascade.debt.paidDirectCents)}</strong>
            </div>
            <div>
              <span>Abatido pelas vendas</span>
              <strong>{reais(cascade.debt.abatedCents)}</strong>
            </div>
          </div>
        </Quadro>

        <Quadro titulo="Fundo de reposição">
          <Progresso
            titulo="Cobertura das compras a pagar"
            fracao={fund.payableCents > 0 ? Math.min(Math.max(fund.balanceCents, 0) / fund.payableCents, 1) : 1}
            detalhe={`Saldo ${reais(fund.balanceCents)} para ${reais(fund.payableCents)} de reposições a pagar`}
            cor={CORES[1]}
          />
          <div className="mini-stats">
            <div>
              <span>Entrou no fundo</span>
              <strong>{reais(fund.enteredCents)}</strong>
            </div>
            <div>
              <span>Já usado</span>
              <strong>{reais(fund.paidCents)}</strong>
            </div>
          </div>
        </Quadro>

        <Quadro titulo="Despesas por categoria" nota={`total ${reais(totalDespesas)}`}>
          <Rosca partes={primeiros(despesasPorCategoria, 5)} centro={reais(totalDespesas)} descricao="Despesas por categoria" />
        </Quadro>

        <Quadro titulo="Estoque por categoria" nota={`${pecasNoSite} no site · ${estoqueBaixo} com estoque baixo`}>
          <BarrasHorizontais partes={estoquePorCategoria} formato="quantidade" cor={CORES[3]} />
        </Quadro>

        <Quadro titulo="Quem recebe o quê" nota="acumulado">
          <div className="mini-stats mini-stats--big">
            <div>
              <span>Fernanda</span>
              <strong>{reais(cascade.totals.fernandaReceivesCents)}</strong>
            </div>
            <div>
              <span>João</span>
              <strong>{reais(cascade.totals.joaoReceivesCents)}</strong>
              <em>{`${porcentagem(cascade.totals.abatedCents, dividaTotal)}% da parte dele já abateu a dívida`}</em>
            </div>
          </div>
        </Quadro>
      </div>
    </main>
  );
}
