import { getPool, ensureSchema } from "@/lib/db";
import { loadFinanceInputs, summarize } from "@/lib/finance/load";
import { formatCentsBRL } from "@/lib/finance/money";
import { formatDateBR } from "@/lib/format";

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
  const { cascade, fund, liabilities } = resumo;
  const vendaPorId = new Map(entradas.sales.map((v) => [v.id, v]));
  const porcentagemQuitada = (cascade.debt.paidFraction * 100).toFixed(1).replace(".", ",");
  const tudoBate = cascade.check.fernandaPlusJoaoEqualsProfit;

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Financeiro</p>
        <h1>Painel financeiro</h1>
        <p>
          Vendas, fundo de reposição, dívida do estoque inicial, quanto cada sócio recebeu e o passivo da
          empresa. Cada número abaixo pode ser conferido na tabela do final.
        </p>
      </div>

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

      <Bloco titulo="Vendas">
        <div className="stat-grid auto">
          <Tile label="Total vendido" value={reais(cascade.totals.soldCents)} tom="accent" />
          <Tile
            label="Já entrou na divisão"
            value={reais(cascade.totals.countedCents)}
            nota={cascade.totals.pendingCents > 0 ? `Ainda a receber: ${reais(cascade.totals.pendingCents)}` : undefined}
          />
          <Tile label="Reposição separada (fundo)" value={reais(cascade.totals.replenishCents)} nota="30% do varejo" />
          <Tile label="Custos das vendas" value={reais(cascade.totals.costsCents)} />
          <Tile label="Lucro líquido a dividir" value={reais(cascade.totals.profitCents)} tom="gold" nota="Venda menos reposição menos custos" />
        </div>
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
          <Tile label="Pago direto à Fernanda" value={reais(cascade.debt.paidDirectCents)} />
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

      <Bloco titulo="Quanto cada um recebeu das vendas" ajuda="A Fernanda usa o que recebe para pagar o passivo da empresa.">
        <div className="stat-grid auto">
          <Tile label="Fernanda (a metade dela mais o repasse do João)" value={reais(cascade.totals.fernandaReceivesCents)} tom="accent" />
          <Tile label="João (depois de quitar a dívida)" value={reais(cascade.totals.joaoReceivesCents)} />
          <Tile
            label="Conferência: soma igual ao lucro líquido"
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

      <Bloco titulo="Estoque comprado (a custo de compra)" ajuda="Por enquanto em valor. O estoque por peça, com baixa automática, vem numa etapa seguinte.">
        <div className="stat-grid auto">
          <Tile label="Estoque inicial" value={reais(fund.initialStockCents)} />
          <Tile label="Reposições compradas" value={reais(fund.purchasesTotalCents)} />
          <Tile label="Total comprado" value={reais(fund.totalStockBoughtCents)} tom="accent" />
        </div>
      </Bloco>

      <Bloco titulo="De onde vem cada número" ajuda="Cada linha é uma venda (ou uma parcela recebida) e mostra como ela foi dividida.">
        {cascade.events.length === 0 ? (
          <div className="empty-state">Ainda não há vendas contadas.</div>
        ) : (
          <div className="table-wrap">
            <table style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th>Entrou em</th>
                  <th>Venda</th>
                  <th>Valor</th>
                  <th>Reposição</th>
                  <th>Custos</th>
                  <th>Lucro</th>
                  <th>Parte do João</th>
                  <th>Abatido da dívida</th>
                  <th>Fernanda recebe</th>
                  <th>João recebe</th>
                  <th>Dívida depois</th>
                </tr>
              </thead>
              <tbody>
                {cascade.events.map((e) => {
                  const venda = vendaPorId.get(e.saleId);
                  return (
                    <tr key={e.key}>
                      <td>{formatDateBR(e.date)}</td>
                      <td>
                        {venda?.label || `Venda ${e.saleId}`}
                        {e.implicit && <div className="hint">sem forma de pagamento informada</div>}
                      </td>
                      <td className="num">{reais(e.baseCents)}</td>
                      <td className="num">{reais(e.replenishCents)}</td>
                      <td className="num">{reais(e.costsCents)}</td>
                      <td className="num">{reais(e.profitCents)}</td>
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
                  <td className="num">{reais(cascade.totals.countedCents)}</td>
                  <td className="num">{reais(cascade.totals.replenishCents)}</td>
                  <td className="num">{reais(cascade.totals.costsCents)}</td>
                  <td className="num">{reais(cascade.totals.profitCents)}</td>
                  <td className="num">{reais(cascade.events.reduce((s, e) => s + e.joaoShareCents, 0))}</td>
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
