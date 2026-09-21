import { getPool, ensureSchema } from "@/lib/db";
import { loadFinanceInputs, summarize } from "@/lib/finance/load";
import { formatCentsBRL } from "@/lib/finance/money";
import type { WholesaleStatus } from "@/lib/finance/wholesale";
import { formatDateBR } from "@/lib/format";
import { lerAcordo } from "@/lib/agreement-db";
import FaixaDoAcordo from "../faixa-do-acordo";

export const dynamic = "force-dynamic";

type Tom = "accent" | "gold" | "danger";

function Tile({ label, value, tom, nota }: { label: string; value: string; tom?: Tom; nota?: string }) {
  return (
    <div className={"stat-tile" + (tom ? ` ${tom}` : "")}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {nota && <div className="stat-note">{nota}</div>}
    </div>
  );
}

function Bloco({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <section className="fin-section">
      <h2 className="section-title">
        <span className="dot" />
        {titulo}
      </h2>
      {ajuda && <p className="fin-help">{ajuda}</p>}
      {children}
    </section>
  );
}

const reais = formatCentsBRL;
const tomDoSaldo = (centavos: number): Tom | undefined => (centavos < 0 ? "danger" : undefined);

const SITUACAO: Record<WholesaleStatus, { texto: string; tom?: Tom }> = {
  aguardando_estoque: { texto: "Aguardando o estoque", tom: "gold" },
  prevista: { texto: "Prevista" },
  atrasada: { texto: "Atrasada", tom: "danger" },
  recebida: { texto: "Recebida", tom: "accent" },
};

const NATUREZA: Record<string, string> = {
  pessoal_fernanda: "Pessoal da Fernanda",
  estoque_inicial: "Estoque inicial",
  reposicao: "Reposição (depois de 01/09)",
  despesa_empresa: "Despesa da empresa",
};

export default async function FinanceiroPage({ searchParams }: { searchParams: { modo?: string } }) {
  const db = getPool();
  if (!db) {
    return (
      <main className="shell shell--wide">
        <div className="banner banner-warning">O banco de dados não está configurado neste ambiente.</div>
      </main>
    );
  }

  await ensureSchema();
  const entradas = await loadFinanceInputs(db);

  // A chave "modo" só serve para você comparar os dois jeitos de contar. Ela não altera nada no sistema.
  const modo =
    searchParams.modo === "venda" || searchParams.modo === "recebimento"
      ? searchParams.modo
      : entradas.settings.mode;
  const resumo = summarize({ ...entradas, settings: { ...entradas.settings, mode: modo } });
  const { cascade, fund, liabilities, wholesale, invoices } = resumo;
  const { valores: acordo } = await lerAcordo(db);
  const vendaPorId = new Map(entradas.sales.map((v) => [v.id, v]));
  const despesaPorId = new Map(entradas.expenses.map((d) => [d.id, d]));
  const porcentagemQuitada = (cascade.debt.paidFraction * 100).toFixed(1).replace(".", ",");
  const tudoBate = cascade.check.fernandaPlusJoaoEqualsDistributable;
  const totalDaParteDoJoao = cascade.events.reduce((s, e) => s + e.joaoShareCents, 0);

  const recebimentoPorId = new Map(entradas.receipts.map((r) => [r.id, r]));
  const aporteDe = (quem: "joao" | "fernanda") =>
    entradas.receipts
      .filter((r) => r.kind === "aporte_socio" && r.partner === quem && r.status === "recebida")
      .reduce((soma, r) => soma + r.amountCents, 0);

  function origem(e: (typeof cascade.events)[number]) {
    if (e.kind === "receita") {
      const r = recebimentoPorId.get(e.receiptId ?? 0);
      const quem = r?.fromName || r?.manufacturerName || "recebimento";
      return e.tier === "atacado"
        ? { titulo: `Comissão: ${quem}`, dica: `comissão de ${r?.manufacturerName ?? "fabricante"}, entra na data em que foi recebida` }
        : { titulo: `Receita: ${quem}`, dica: r?.reason || "outra receita, entra na data em que foi recebida" };
    }
    if (e.kind === "despesa") {
      const d = despesaPorId.get(e.expenseId ?? 0);
      return { titulo: `Despesa: ${d?.description || "da empresa"}`, dica: "sai do lucro antes da divisão" };
    }
    const v = vendaPorId.get(e.saleId);
    const nome = v?.label || `Venda ${e.saleId}`;
    if (e.tier === "atacado") return { titulo: nome, dica: `atacado, comissão de ${v?.manufacturerName ?? "fabricante"}` };
    if (e.tier === "consignado") return { titulo: nome, dica: "consignado" };
    return { titulo: nome, dica: e.implicit ? "sem forma de pagamento informada" : undefined };
  }

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Financeiro</p>
        <h1>Painel financeiro</h1>
        <p>
          Vendas, atacado, fundo de reposição, dívida do estoque inicial, quanto cada sócio recebeu, passivo e
          faturas do cartão. Cada número pode ser conferido na tabela do final.
        </p>
      </div>

      <FaixaDoAcordo
        dados={{ joaoSharePct: acordo.joaoSharePct, initialStockCents: acordo.initialStockCents, partnershipStart: acordo.partnershipStart, debt: cascade.debt }}
      />

      <div className="tabs" aria-label="Como contar">
        <a className={"tab-btn" + (modo === "recebimento" ? " active" : "")} href="/financeiro?modo=recebimento">
          Pelo dinheiro que entrou
        </a>
        <a className={"tab-btn" + (modo === "venda" ? " active" : "")} href="/financeiro?modo=venda">
          Pela data da venda
        </a>
      </div>
      <p className="fin-help" style={{ marginTop: -12 }}>
        {modo === "recebimento"
          ? "Só entra na divisão o dinheiro que já foi recebido. Vendas sem forma de pagamento informada contam como recebidas na data da venda."
          : "Toda venda entra na divisão na data em que foi feita, mesmo que o dinheiro ainda não tenha entrado."}{" "}
        Esta chave serve só para comparar. Ela não muda nada no sistema.
      </p>

      {resumo.warnings.length > 0 && (
        <div className="banner banner-warning" role="status" style={{ flexDirection: "column", gap: 4 }}>
          {resumo.warnings.map((aviso, i) => (
            <span key={i}>
              {aviso.message}
              {aviso.saleIds ? ` (${aviso.saleIds.length} ${aviso.saleIds.length === 1 ? "venda" : "vendas"})` : ""}
            </span>
          ))}
        </div>
      )}

      <Bloco titulo="Vendas (varejo e consignado)">
        <div className="stat-grid auto">
          <Tile label="Total vendido" value={reais(cascade.totals.soldCents)} tom="accent" />
          <Tile
            label="Já entrou na divisão"
            value={reais(cascade.totals.countedCents)}
            nota={cascade.totals.pendingCents > 0 ? `Ainda a receber: ${reais(cascade.totals.pendingCents)}` : undefined}
          />
          <Tile label="Reposição separada (fundo)" value={reais(cascade.totals.replenishCents)} nota="30% do varejo" />
          <Tile label="Custos das vendas" value={reais(cascade.totals.costsCents)} />
          <Tile label="Lucro das vendas" value={reais(cascade.totals.profitCents)} tom="gold" nota="Venda menos reposição menos custos" />
          <Tile label="Despesas da empresa" value={reais(cascade.totals.expensesCents)} nota="Saem do lucro antes da divisão" />
          {cascade.totals.carryCents > 0 && (
            <Tile
              label="Despesas ainda a compensar"
              value={reais(cascade.totals.carryCents)}
              tom="danger"
              nota="Serão descontadas dos próximos lucros"
            />
          )}
          <Tile label="Lucro dividido entre os sócios" value={reais(cascade.totals.distributableCents)} tom="accent" />
        </div>
      </Bloco>

      <Bloco
        titulo="Atacado (comissão dos fabricantes que representamos)"
        ajuda="No atacado o cliente paga direto ao fabricante. A receita da sociedade é a comissão, que o fabricante paga depois de receber o estoque, no prazo dele. A comissão só entra na divisão do lucro quando é recebida."
      >
        {wholesale.manufacturers.length === 0 ? (
          <div className="empty-state">Ainda não há vendas de atacado com fabricante representado.</div>
        ) : (
          <>
            <div className="stat-grid auto">
              <Tile label="Volume vendido no atacado" value={reais(wholesale.grossCents)} nota="Pago direto ao fabricante" />
              <Tile label="Comissão total" value={reais(wholesale.commissionCents)} tom="accent" />
              <Tile label="Comissão já recebida" value={reais(wholesale.receivedCents)} />
              <Tile label="Comissão a receber" value={reais(wholesale.pendingCents)} tom="gold" />
              {wholesale.overdueCents > 0 && (
                <Tile label="Comissão atrasada" value={reais(wholesale.overdueCents)} tom="danger" />
              )}
            </div>
            {wholesale.manufacturers.map((f) => (
              <div key={f.manufacturerId ?? f.name} style={{ marginTop: 20 }}>
                <h3 className="fin-sub">
                  {f.name}
                  <span className="fin-sub-note">
                    {`${String(f.commissionPct).replace(".", ",")}% de comissão, lembrete de ${f.commissionDays} dias depois de receber o estoque`}
                  </span>
                </h3>
                {f.reminders.length > 0 && (
                  <p className="fin-help">
                    {`Recebimentos previstos lançados: ${f.reminders
                      .map(
                        (l) =>
                          `${reais(l.amountCents)} ${l.expectedDate ? `em ${formatDateBR(l.expectedDate)}` : "sem data"}${l.fromName ? ` (${l.fromName})` : ""}`
                      )
                      .join("; ")}`}
                  </p>
                )}
                {f.excessCents > 0 && (
                  <p className="fin-help">{`Recebido acima das vendas lançadas: ${reais(f.excessCents)}`}</p>
                )}
                <div className="table-wrap">
                  <table style={{ minWidth: 900 }}>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Cliente</th>
                        <th>Valor da venda</th>
                        <th>Comissão</th>
                        <th>Recebida</th>
                        <th>Estoque recebido em</th>
                        <th>Lembrete de data</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.items.map((item) => (
                        <tr key={item.saleId}>
                          <td>{formatDateBR(item.date)}</td>
                          <td>{item.label || `Venda ${item.saleId}`}</td>
                          <td className="num">{reais(item.grossCents)}</td>
                          <td className="num">{reais(item.commissionCents)}</td>
                          <td className="num">{reais(item.receivedCents)}</td>
                          <td>{item.stockReceivedDate ? formatDateBR(item.stockReceivedDate) : "-"}</td>
                          <td>{item.dueDate ? formatDateBR(item.dueDate) : "-"}</td>
                          <td className={SITUACAO[item.status].tom ? `status-${SITUACAO[item.status].tom}` : undefined}>
                            {SITUACAO[item.status].texto}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        )}
      </Bloco>

      <Bloco
        titulo="Recebimentos fora das vendas"
        ajuda="Aportes dos sócios, comissões de fabricantes e receitas de outros ramos. O aporte do João abate a dívida dele. Aportes não entram no lucro dividido. Comissões e outras receitas entram na divisão na data em que foram recebidas."
      >
        <div className="stat-grid auto">
          <Tile label="Comissões de fabricantes na divisão" value={reais(cascade.totals.wholesaleCommissionCountedCents)} tom="accent" />
          <Tile label="Outras receitas na divisão" value={reais(cascade.totals.otherIncomeCountedCents)} tom="accent" />
          <Tile label="Aportes do João" value={reais(aporteDe("joao"))} nota="Abatem a dívida do estoque inicial" />
          <Tile label="Aportes da Fernanda" value={reais(aporteDe("fernanda"))} nota="Só registro, não é passivo" />
        </div>
        <p className="fin-help">
          <a href="/financeiro/recebimentos">Ver e lançar recebimentos</a>
        </p>
      </Bloco>

      <Bloco titulo="Fundo de reposição" ajuda="O dinheiro da reposição fica separado para pagar as compras novas de estoque.">
        <div className="stat-grid auto">
          <Tile label="Entrou no fundo" value={reais(fund.enteredCents)} tom="accent" />
          <Tile label="Já usado para pagar reposições" value={reais(fund.paidCents)} />
          <Tile label="Saldo do fundo" value={reais(fund.balanceCents)} tom={tomDoSaldo(fund.balanceCents)} />
          <Tile label="Reposições compradas ainda a pagar" value={reais(fund.payableCents)} />
          <Tile
            label="Fundo menos reposições a pagar"
            value={reais(fund.balanceMinusPayableCents)}
            tom={tomDoSaldo(fund.balanceMinusPayableCents)}
            nota={fund.balanceMinusPayableCents < 0 ? "O fundo ainda não cobre as compras" : "O fundo cobre as compras"}
          />
        </div>
      </Bloco>

      <Bloco
        titulo="Dívida do João com a Fernanda (estoque inicial)"
        ajuda="Enquanto a dívida não for quitada, a parte do João no lucro é repassada à Fernanda e abate a dívida."
      >
        <div className="stat-grid auto">
          <Tile label="Total da dívida" value={reais(cascade.debt.totalCents)} nota="Metade do estoque inicial" />
          <Tile label="Aportes do João (pago direto à Fernanda)" value={reais(cascade.debt.paidDirectCents)} />
          <Tile label="Abatido pelas vendas" value={reais(cascade.debt.abatedCents)} tom="accent" />
          <Tile label="Saldo devedor" value={reais(cascade.debt.balanceCents)} tom="gold" />
        </div>
        <div className="progress-wrap">
          <div className="progress" role="progressbar" aria-valuenow={Math.round(cascade.debt.paidFraction * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${cascade.debt.paidFraction * 100}%` }} />
          </div>
          <div className="progress-label">{`${porcentagemQuitada}% quitado`}</div>
        </div>
      </Bloco>

      <Bloco titulo="Quanto cada um recebeu" ajuda="A Fernanda usa o que recebe para pagar o passivo da empresa.">
        <div className="stat-grid auto">
          <Tile label="Fernanda (a metade dela mais o repasse do João)" value={reais(cascade.totals.fernandaReceivesCents)} tom="accent" />
          <Tile label="João (depois de quitar a dívida)" value={reais(cascade.totals.joaoReceivesCents)} />
          <Tile
            label="Conferência: soma igual ao lucro dividido"
            value={tudoBate ? "OK" : "DIFERENÇA"}
            tom={tudoBate ? "accent" : "danger"}
          />
        </div>
      </Bloco>

      <Bloco titulo="Passivo da empresa (Fernanda)">
        <div className="stat-grid auto">
          <Tile label="Total do passivo" value={reais(liabilities.totalCents)} />
          <Tile label="Já pago" value={reais(liabilities.paidCents)} />
          <Tile label="Saldo a pagar" value={reais(liabilities.balanceCents)} tom="gold" />
        </div>
      </Bloco>

      {invoices.length > 0 && (
        <Bloco
          titulo="Faturas do cartão"
          ajuda="Cada fatura se divide em partes: o pessoal da Fernanda e o estoque inicial ela paga com o dinheiro dela, a reposição é paga pelo fundo, e a despesa da empresa sai do lucro. As partes precisam somar o total."
        >
          {invoices.map((f) => (
            <div key={f.invoiceId} style={{ marginBottom: 18 }}>
              <h3 className="fin-sub">
                {f.description}
                <span className="fin-sub-note">
                  vence em {formatDateBR(f.dueDate)}
                  {f.totalCents === null ? ", aguardando o fechamento" : `, total ${reais(f.totalCents)}`}
                </span>
              </h3>
              <div className="stat-grid auto">
                <Tile label={NATUREZA.pessoal_fernanda} value={reais(f.byNature.pessoal_fernanda)} nota="Fernanda paga, fora da empresa" />
                <Tile label={NATUREZA.estoque_inicial} value={reais(f.byNature.estoque_inicial)} nota="Fernanda paga, é o passivo dela" />
                <Tile label={NATUREZA.reposicao} value={reais(f.byNature.reposicao)} nota="Pago pelo fundo de reposição" />
                <Tile label={NATUREZA.despesa_empresa} value={reais(f.byNature.despesa_empresa)} nota="Sai do lucro antes da divisão" />
                <Tile
                  label="Conferência com o total"
                  value={f.totalCents === null ? "Sem total" : f.closes ? "Fecha" : `Diferença ${reais(f.differenceCents ?? 0)}`}
                  tom={f.closes ? "accent" : "danger"}
                />
              </div>
            </div>
          ))}
        </Bloco>
      )}

      <Bloco titulo="Estoque comprado (a custo de compra)" ajuda="Por enquanto em valor. O estoque por peça, com baixa automática, vem numa etapa seguinte.">
        <div className="stat-grid auto">
          <Tile label="Estoque inicial" value={reais(fund.initialStockCents)} />
          <Tile label="Reposições compradas" value={reais(fund.purchasesTotalCents)} />
          <Tile label="Total comprado" value={reais(fund.totalStockBoughtCents)} tom="accent" />
        </div>
      </Bloco>

      <Bloco titulo="De onde vem cada número" ajuda="Cada linha é uma venda, uma parcela recebida ou uma despesa, e mostra como foi dividida.">
        {cascade.events.length === 0 ? (
          <div className="empty-state">Ainda não há vendas contadas.</div>
        ) : (
          <div className="table-wrap">
            <table style={{ minWidth: 1250 }}>
              <thead>
                <tr>
                  <th>Entrou em</th>
                  <th>Origem</th>
                  <th>Valor que entrou</th>
                  <th>Reposição</th>
                  <th>Custos</th>
                  <th>Lucro</th>
                  <th>Descontado (despesas)</th>
                  <th>Dividido</th>
                  <th>Parte do João</th>
                  <th>Abatido da dívida</th>
                  <th>Fernanda recebe</th>
                  <th>João recebe</th>
                  <th>Dívida depois</th>
                </tr>
              </thead>
              <tbody>
                {cascade.events.map((e) => {
                  const o = origem(e);
                  return (
                    <tr key={e.key}>
                      <td>{formatDateBR(e.date)}</td>
                      <td>
                        {o.titulo}
                        {o.dica && <div className="hint">{o.dica}</div>}
                      </td>
                      <td className="num">{e.kind === "despesa" ? "-" : reais(e.baseCents)}</td>
                      <td className="num">{reais(e.replenishCents)}</td>
                      <td className="num">{reais(e.costsCents)}</td>
                      <td className="num">{e.kind === "despesa" ? `-${reais(e.expenseCents)}` : reais(e.profitCents)}</td>
                      <td className="num">{reais(e.compensatedCents)}</td>
                      <td className="num">{reais(e.distributableCents)}</td>
                      <td className="num">{reais(e.joaoShareCents)}</td>
                      <td className="num">{reais(e.abatementCents)}</td>
                      <td className="num">{reais(e.fernandaReceivesCents)}</td>
                      <td className="num">{reais(e.joaoReceivesCents)}</td>
                      <td className="num">{reais(e.debtAfterCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Totais</td>
                  <td className="num">{reais(cascade.totals.countedCents + cascade.totals.wholesaleCommissionCountedCents)}</td>
                  <td className="num">{reais(cascade.totals.replenishCents)}</td>
                  <td className="num">{reais(cascade.totals.costsCents)}</td>
                  <td className="num">{reais(cascade.totals.profitCents - cascade.totals.expensesCents)}</td>
                  <td className="num">{reais(cascade.totals.compensatedCents)}</td>
                  <td className="num">{reais(cascade.totals.distributableCents)}</td>
                  <td className="num">{reais(totalDaParteDoJoao)}</td>
                  <td className="num">{reais(cascade.totals.abatedCents)}</td>
                  <td className="num">{reais(cascade.totals.fernandaReceivesCents)}</td>
                  <td className="num">{reais(cascade.totals.joaoReceivesCents)}</td>
                  <td className="num">{reais(cascade.debt.balanceCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Bloco>
    </main>
  );
}
