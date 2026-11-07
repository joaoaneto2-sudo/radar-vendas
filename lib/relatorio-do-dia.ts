import { formatCentsBRL, toCents, type Cents } from "./finance/money";
import { addDaysISO } from "./finance/dates";
import { valorBrutoDoAtacado, valorVendido, type VendaLinha } from "./dashboard";
import { mesDe, nomeDoMes, resumoMensal, type DadosDaMeta } from "./meta-mensal";

// Relatório do fim do dia que o Roberto posta no grupo do WhatsApp.
// Função pura: recebe os dados já lidos do banco e devolve o texto pronto.

export interface VendaDoRelatorio extends VendaLinha {
  cost?: number | string | null;
}

export interface ParcelaDoRelatorio {
  due_date: string;
  amount: number | string;
  client_name?: string | null;
}

export interface DadosDoRelatorio {
  dia: string; // AAAA-MM-DD do relatório
  vendas: VendaDoRelatorio[]; // todas as vendas (o relatório filtra dia e mês)
  aReceber: ParcelaDoRelatorio[]; // parcelas previstas (ainda não recebidas), sem atacado
  meta: DadosDaMeta; // mesmos dados da tela Visão geral
}

const reais = (c: Cents) => formatCentsBRL(c).replace(/ /g, " ");
const ativa = (v: VendaLinha) => v.status !== "cancelada";
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function diaDaSemana(d: string): string {
  return DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()];
}

export function montarRelatorioDoDia(dados: DadosDoRelatorio): string {
  const { dia } = dados;
  const mes = mesDe(dia);
  const linhas: string[] = [];
  linhas.push(`📊 *RELATÓRIO DO DIA* · ${diaDaSemana(dia)}, ${dataBR(dia)}`);
  linhas.push("");

  // --- Hoje
  const doDia = dados.vendas.filter((v) => ativa(v) && String(v.sale_date).slice(0, 10) === dia);
  const varejoHoje = doDia.filter((v) => v.price_tier !== "atacado");
  const atacadoHoje = doDia.filter((v) => v.price_tier === "atacado");
  const totalHoje = varejoHoje.reduce((t, v) => t + valorVendido(v), 0);
  if (doDia.length === 0) {
    linhas.push("🛍️ *Hoje:* nenhuma venda lançada.");
  } else {
    linhas.push(`🛍️ *Hoje:* ${varejoHoje.length} venda${varejoHoje.length === 1 ? "" : "s"} · *${reais(totalHoje)}*`);
    for (const v of varejoHoje) {
      linhas.push(`• ${v.client_name || "Sem nome"}: ${reais(valorVendido(v))} (${v.payment_method || "pagamento não informado"})`);
    }
    if (atacadoHoje.length > 0) {
      const bruto = atacadoHoje.reduce((t, v) => t + valorBrutoDoAtacado(v), 0);
      linhas.push(`• Atacado: ${atacadoHoje.length} pedido${atacadoHoje.length === 1 ? "" : "s"} · ${reais(bruto)} (pago ao fabricante)`);
    }
  }
  linhas.push("");

  // --- Mês até hoje
  const doMes = dados.vendas.filter(
    (v) => ativa(v) && mesDe(String(v.sale_date)) === mes && String(v.sale_date).slice(0, 10) <= dia
  );
  const varejoMes = doMes.filter((v) => v.price_tier !== "atacado");
  const vendidoMes = varejoMes.reduce((t, v) => t + valorVendido(v), 0);
  const atacadoMes = doMes.reduce((t, v) => t + valorBrutoDoAtacado(v), 0);
  const nome = nomeDoMes(mes);
  linhas.push(`📅 *${nome.charAt(0).toUpperCase() + nome.slice(1)} até hoje:* ${reais(vendidoMes)} em ${varejoMes.length} venda${varejoMes.length === 1 ? "" : "s"}`);
  if (atacadoMes > 0) linhas.push(`• Atacado no mês: ${reais(atacadoMes)}`);

  // --- Meta do mês (dinheiro que entrou x contas do mês)
  const resumo = resumoMensal({ ...dados.meta, hoje: dia }).find((r) => r.mes === mes);
  if (resumo && resumo.metaCents > 0) {
    const pct = Math.min(999, Math.round((resumo.entrouCents / resumo.metaCents) * 100));
    linhas.push(`🎯 *Meta do mês:* ${reais(resumo.metaCents)} · entrou ${reais(resumo.entrouCents)} (${pct}%)`);
    linhas.push(
      resumo.saldoCents >= 0
        ? `✅ Meta batida, sobra de ${reais(resumo.saldoCents)}`
        : `⏳ Faltam ${reais(-resumo.saldoCents)} até dia 30`
    );
  }
  linhas.push("");

  // --- A receber
  const previstas = dados.aReceber.map((p) => ({ ...p, due_date: String(p.due_date).slice(0, 10), cents: toCents(p.amount) }));
  const atrasadas = previstas.filter((p) => p.due_date < dia);
  const amanha = addDaysISO(dia, 1);
  const em7 = addDaysISO(dia, 7);
  const proximas = previstas.filter((p) => p.due_date >= dia && p.due_date <= em7);
  const soma = (l: { cents: Cents }[]) => l.reduce((t, p) => t + p.cents, 0);
  linhas.push("💰 *A receber*");
  if (atrasadas.length > 0) {
    linhas.push(`🔴 Atrasado: ${reais(soma(atrasadas))} (${atrasadas.length} parcela${atrasadas.length === 1 ? "" : "s"})`);
    for (const p of atrasadas.sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5)) {
      linhas.push(`• ${p.client_name || "Sem nome"}: ${reais(p.cents)} (venceu ${dataBR(p.due_date)})`);
    }
    if (atrasadas.length > 5) linhas.push(`• e mais ${atrasadas.length - 5}`);
  }
  if (proximas.length > 0) {
    linhas.push(`🟡 Próximos 7 dias: ${reais(soma(proximas))}`);
    for (const p of proximas.sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5)) {
      const quando = p.due_date === dia ? "hoje" : p.due_date === amanha ? "amanhã" : dataBR(p.due_date);
      linhas.push(`• ${p.client_name || "Sem nome"}: ${reais(p.cents)} (${quando})`);
    }
    if (proximas.length > 5) linhas.push(`• e mais ${proximas.length - 5}`);
  }
  if (atrasadas.length === 0 && proximas.length === 0) linhas.push("Nada vencido nem vencendo nos próximos 7 dias.");

  // --- Pendências de cadastro
  const semCusto = varejoMes.filter((v) => v.cost === null || v.cost === undefined || v.cost === "").length;
  if (semCusto > 0) {
    linhas.push("");
    linhas.push(`⚠️ ${semCusto} venda${semCusto === 1 ? "" : "s"} do mês sem custo no Radar: completar para ver o lucro.`);
  }

  linhas.push("");
  linhas.push("_Enviado automaticamente pelo Radar de Vendas._");
  return linhas.join("\n");
}
