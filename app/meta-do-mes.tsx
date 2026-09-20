import { formatCentsBRL } from "@/lib/finance/money";
import {
  nomeDoMes,
  rotuloDoMes,
  somarMeses,
  type Comparativo,
  type MesResumo,
  type PontoAcumulado,
  type Ritmo,
  type Situacao,
  type Tendencia,
} from "@/lib/meta-mensal";
import { BarrasDuplas, BarrasVerticais, CORES, DuasLarguras, LinhaDaMeta, Quadro } from "./charts";

// Meta do mês: o valor que precisamos pagar até o dia 30 (fatura do cartão e despesas da empresa),
// contra o dinheiro que já entrou. As contas ficam em lib/meta-mensal.ts.

const reais = formatCentsBRL;
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  batida: "Meta batida",
  em_andamento: "Em andamento",
  nao_batida: "Não batida",
  futuro: "Previsto",
  sem_meta: "Sem meta",
};

function Variacao({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="var var--none">sem base</span>;
  const classe = valor > 0 ? "var--up" : valor < 0 ? "var--down" : "var--flat";
  const seta = valor > 0 ? "▲" : valor < 0 ? "▼" : "•";
  return <span className={`var ${classe}`}>{`${seta} ${Math.abs(valor)}%`}</span>;
}

function fraseDeRitmo(r: Ritmo, ticketMedio: number): string {
  if (r.metaCents <= 0) return "Nenhuma fatura do cartão nem despesa da empresa lançada para este mês ainda. Lance em Despesas e faturas para a meta aparecer.";
  if (r.faltaCents <= 0) return `Meta batida: já entrou ${reais(r.entrouCents)} e a meta é ${reais(r.metaCents)}. Sobraram ${reais(r.sobraCents)}.`;

  const prazo =
    r.diasRestantes > 0
      ? `Faltam ${reais(r.faltaCents)} em ${plural(r.diasRestantes, "dia", "dias")}. Precisa entrar ${reais(r.necessidadePorDia ?? 0)} por dia`
      : `Hoje é o dia da meta e faltam ${reais(r.faltaCents)}`;
  const equivale = r.vendasEquivalentes && ticketMedio > 0 ? ` (cerca de ${plural(r.vendasEquivalentes, "venda", "vendas")} no ticket médio de ${reais(ticketMedio)})` : "";
  const ritmo =
    r.diasRestantes > 0
      ? ` Hoje a média é ${reais(r.mediaEntradaPorDia)} por dia, então no ritmo atual chegam ${reais(r.projecaoEntradaCents)} de ${reais(r.metaCents)}: ${r.vaiBater ? "a meta deve ser batida" : "a meta não seria batida"}.`
      : "";
  return `${prazo}${equivale}.${ritmo}`;
}

function textoDaTendencia(t: Tendencia, r: Ritmo): { titulo: string; texto: string; classe: string } {
  const proximo = nomeDoMes(somarMeses(r.mes, 1));
  const ritmoDoMes = `No ritmo de hoje, ${nomeDoMes(r.mes)} fecha com cerca de ${reais(r.projecaoVendidoCents)} vendidos.`;
  if (t.estado === "poucos_meses") {
    const base = t.mesesUsados === 0 ? "Ainda não há mês fechado com vendas" : `Só há ${plural(t.mesesUsados, "mês fechado", "meses fechados")} com vendas`;
    return { titulo: "Ainda é cedo", texto: `${base}. A tendência aparece a partir de 3 meses fechados. ${ritmoDoMes}`, classe: "var--flat" };
  }
  const previsao = t.previsaoProximoMesCents === null ? "" : ` Previsão para ${proximo}: ${reais(t.previsaoProximoMesCents)}.`;
  const por = `${reais(Math.abs(t.inclinacaoCents))} por mês`;
  if (t.estado === "subindo") return { titulo: "▲ Vendas subindo", texto: `Em média ${por} a mais, nos últimos ${t.mesesUsados} meses fechados.${previsao} ${ritmoDoMes}`, classe: "var--up" };
  if (t.estado === "caindo") return { titulo: "▼ Vendas caindo", texto: `Em média ${por} a menos, nos últimos ${t.mesesUsados} meses fechados.${previsao} ${ritmoDoMes}`, classe: "var--down" };
  return { titulo: "• Vendas estáveis", texto: `Sem mudança relevante nos últimos ${t.mesesUsados} meses fechados.${previsao} ${ritmoDoMes}`, classe: "var--flat" };
}

export default function MetaDoMes({
  ritmo,
  resumo,
  acumulado,
  comparativo,
  tendencia,
  ticketMedio,
}: {
  ritmo: Ritmo;
  resumo: MesResumo[];
  acumulado: PontoAcumulado[];
  comparativo: Comparativo;
  tendencia: Tendencia;
  ticketMedio: number;
}) {
  const mes = maiuscula(nomeDoMes(ritmo.mes));
  const diaFinal = Number(ritmo.diaDaMeta.slice(8, 10));
  const pct = ritmo.metaCents > 0 ? Math.min((ritmo.entrouCents / ritmo.metaCents) * 100, 100) : 0;
  const batida = ritmo.metaCents > 0 && ritmo.faltaCents <= 0;
  const t = textoDaTendencia(tendencia, ritmo);
  const atual = resumo.find((m) => m.mes === ritmo.mes);

  return (
    <section className="meta" aria-label={`Meta de ${mes}`}>
      <div className={"meta-kpi" + (batida ? " meta-kpi--ok" : "")}>
        <div className="meta-kpi-main">
          <p className="meta-kpi-eyebrow">{`Meta de ${mes} · até o dia ${diaFinal}`}</p>
          <div className="meta-kpi-value">{reais(ritmo.metaCents)}</div>
          <p className="meta-kpi-sub">
            {atual && atual.faturaCents > 0 && <span>{`Fatura do cartão ${reais(atual.faturaCents)}`}</span>}
            {atual && atual.avulsasCents > 0 && <span>{`Despesas ${reais(atual.avulsasCents)}`}</span>}
            {atual && atual.metaCents === 0 && <span>Nada lançado ainda</span>}
          </p>
        </div>

        <div className="meta-kpi-progress">
          <div className="meta-kpi-line">
            <span>{`Entrou ${reais(ritmo.entrouCents)}`}</span>
            <strong className={batida ? "ok" : "falta"}>
              {ritmo.metaCents <= 0 ? "" : batida ? `Sobra ${reais(ritmo.sobraCents)}` : `Faltam ${reais(ritmo.faltaCents)}`}
            </strong>
          </div>
          <div className="meta-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Quanto da meta já entrou">
            <div className="meta-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="meta-kpi-line meta-kpi-line--small">
            <span>{`${Math.round(pct)}% da meta`}</span>
            <span>{ritmo.diasRestantes > 0 ? plural(ritmo.diasRestantes, "dia restante", "dias restantes") : "Hoje é o dia da meta"}</span>
          </div>
        </div>

        <p className="meta-kpi-text">{fraseDeRitmo(ritmo, ticketMedio)}</p>

        <div className="meta-nums">
          <div>
            <span>Média de vendas por dia</span>
            <strong>{reais(ritmo.mediaVendaPorDia)}</strong>
          </div>
          <div>
            <span>Média que entra por dia</span>
            <strong>{reais(ritmo.mediaEntradaPorDia)}</strong>
          </div>
          <div>
            <span>Precisa entrar por dia</span>
            <strong>{ritmo.necessidadePorDia === null ? "Nada" : reais(ritmo.necessidadePorDia)}</strong>
          </div>
          <div>
            <span>{`Entrada prevista no dia ${diaFinal}`}</span>
            <strong>{reais(ritmo.projecaoEntradaCents)}</strong>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <Quadro titulo="Entrada do mês contra a meta" nota="linha cheia: entrou · pontilhada: no ritmo atual" largo>
          <DuasLarguras
            desenhar={(largura) => (
              <LinhaDaMeta pontos={acumulado} metaCents={ritmo.metaCents} descricao={`Dinheiro que entrou em ${nomeDoMes(ritmo.mes)} contra a meta`} largura={largura} />
            )}
          />
        </Quadro>

        <Quadro titulo={`Mês contra mês, até o dia ${comparativo.dia}`} nota={`${rotuloDoMes(comparativo.mes)} contra ${rotuloDoMes(comparativo.mesAnterior)}`}>
          <div className="table-wrap table-wrap--flat">
            <table className="compare">
              <thead>
                <tr>
                  <th>{"Item"}</th>
                  <th>{rotuloDoMes(comparativo.mes)}</th>
                  <th>{rotuloDoMes(comparativo.mesAnterior)}</th>
                  <th>Variação</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Vendido</td>
                  <td>{reais(comparativo.vendidoAtual)}</td>
                  <td>{reais(comparativo.vendidoAnterior)}</td>
                  <td>
                    <Variacao valor={comparativo.variacaoVendido} />
                  </td>
                </tr>
                <tr>
                  <td>Entrou</td>
                  <td>{reais(comparativo.entrouAtual)}</td>
                  <td>{reais(comparativo.entrouAnterior)}</td>
                  <td>
                    <Variacao valor={comparativo.variacaoEntrou} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="dash-note">O mês anterior é contado só até o mesmo dia, para a comparação ser justa.</p>
        </Quadro>

        <Quadro titulo="Tendência das vendas" nota="meses fechados">
          <p className={"trend-title " + t.classe}>{t.titulo}</p>
          <p className="dash-note dash-note--first">{t.texto}</p>
          <BarrasVerticais
            pontos={resumo.filter((m) => m.mes <= ritmo.mes).map((m) => ({ chave: m.mes, rotulo: m.rotulo, cents: m.vendidoCents }))}
            cor={CORES[1]}
            descricao="Vendido em cada mês"
          />
        </Quadro>

        <Quadro titulo="Meta e entrada, mês a mês" nota="meta = fatura + despesas" largo>
          <DuasLarguras
            desenhar={(largura) => (
              <BarrasDuplas
                grupos={resumo.map((m) => ({ rotulo: m.rotulo, a: m.metaCents, b: m.entrouCents }))}
                nomeA="Meta"
                nomeB="Entrou"
                descricao="Meta e dinheiro que entrou em cada mês"
                largura={largura}
              />
            )}
          />
        </Quadro>

        <Quadro titulo="Tabela da meta, mês a mês" nota="fatura sem a parte pessoal da Fernanda e sem o estoque inicial" largo>
          <div className="table-wrap table-wrap--flat">
            <table className="meta-table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Fatura</th>
                  <th>Despesas</th>
                  <th>Meta</th>
                  <th>Vendido</th>
                  <th>Entrou</th>
                  <th>Saldo</th>
                  <th>Variação vendas</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {resumo.map((m) => (
                  <tr key={m.mes} className={m.mes === ritmo.mes ? "is-current" : undefined}>
                    <td>{maiuscula(m.rotulo)}</td>
                    <td>{m.faturaCents ? reais(m.faturaCents) : "-"}</td>
                    <td>{m.avulsasCents ? reais(m.avulsasCents) : "-"}</td>
                    <td>
                      <strong>{m.metaCents ? reais(m.metaCents) : "-"}</strong>
                    </td>
                    <td>{m.mes > ritmo.mes ? "-" : reais(m.vendidoCents)}</td>
                    <td>{m.mes > ritmo.mes ? "-" : reais(m.entrouCents)}</td>
                    <td>
                      {m.mes > ritmo.mes || m.metaCents === 0 ? (
                        "-"
                      ) : (
                        <span className={m.saldoCents >= 0 ? "var--up" : "var--down"}>{`${m.saldoCents >= 0 ? "+" : "-"}${reais(Math.abs(m.saldoCents))}`}</span>
                      )}
                    </td>
                    <td>{m.mes > ritmo.mes ? "-" : <Variacao valor={m.variacaoVendido} />}</td>
                    <td>
                      <span className={`pill pill--${m.situacao}`}>{ROTULO_DA_SITUACAO[m.situacao]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Quadro>
      </div>
    </section>
  );
}
