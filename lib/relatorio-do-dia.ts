import { formatCentsBRL, toCents, type Cents } from "./finance/money";
import { addDaysISO } from "./finance/dates";
import { valorBrutoDoAtacado, valorVendido, type VendaLinha } from "./dashboard";
import { mesDe, nomeDoMes, resumoMensal, type DadosDaMeta } from "./meta-mensal";

// Relatório do fim do dia que o Roberto posta no grupo do WhatsApp.
// Função pura: recebe os dados já lidos do banco e devolve o texto pronto.

export interface VendaDoRelatorio extends VendaLinha {
  cost?: number | string | null;
  client_id?: number | null;
  supplier?: string | null;
  product_name?: string | null; // nome da peça cadastrada, quando a venda está ligada a uma
}

// ---------- TOP FIVE (peças e fornecedores) ----------

const semAcentoMin = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Textos que não dizem qual peça ou qual fornecedor: ficam fora do ranking.
const GENERICOS = new Set(["", "peca", "pecas", "varios", "varias", "diversos", "diversas", "-", "sem"]);

/** Chave para juntar grafias diferentes: "MILLANO", "Milano", "Millano " e "Bia Belluti"/"Bia Belutti". */
function chaveDoNome(t: string): string {
  return semAcentoMin(t).replace(/[^a-z0-9 ]/g, "").replace(/(.)\1+/g, "$1").trim();
}

/** "1 brinco pizza dourado" vira "brinco pizza dourado"; "7 peças" vira "peças" (genérico). */
function nomeDaPeca(v: VendaDoRelatorio): string {
  const bruto = (v.product_name || v.product_type || "").trim();
  return bruto.replace(/^\d+\s*(x\s*)?/i, "").trim();
}

function capitalizar(t: string): string {
  const limpo = t.replace(/\s+/g, " ").trim();
  if (limpo === limpo.toUpperCase() && limpo.length > 3) {
    return limpo.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());
  }
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

export interface ItemDoRanking {
  nome: string;
  vendas: number;
  cents: Cents;
}

/** Top N do mês por valor vendido (varejo e atacado, só vendas ativas). Empate: mais vendas, depois nome. */
export function topDoMes(
  vendas: VendaDoRelatorio[],
  mes: string,
  ateODia: string,
  nomeDe: (v: VendaDoRelatorio) => string,
  n = 5
): ItemDoRanking[] {
  const grupos = new Map<string, { nomes: Map<string, number>; vendas: number; cents: Cents }>();
  for (const v of vendas) {
    const d = String(v.sale_date).slice(0, 10);
    if (!ativa(v) || mesDe(d) !== mes || d > ateODia) continue;
    const nome = nomeDe(v);
    const chave = chaveDoNome(nome);
    if (GENERICOS.has(chave) || GENERICOS.has(semAcentoMin(nome))) continue;
    const g = grupos.get(chave) ?? { nomes: new Map(), vendas: 0, cents: 0 };
    g.nomes.set(nome.trim(), (g.nomes.get(nome.trim()) ?? 0) + 1);
    g.vendas += 1;
    g.cents += v.sale_value === null || v.sale_value === "" || v.sale_value === undefined ? 0 : toCents(v.sale_value);
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .map((g) => {
      // Mostra a grafia mais usada.
      const nome = [...g.nomes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      return { nome: capitalizar(nome), vendas: g.vendas, cents: g.cents };
    })
    .sort((a, b) => b.cents - a.cents || b.vendas - a.vendas || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, n);
}

const MEDALHAS = ["🥇", "🥈", "🥉", "4.", "5."];

function blocoDoRanking(titulo: string, meses: { mes: string; ate: string }[], vendas: VendaDoRelatorio[], nomeDe: (v: VendaDoRelatorio) => string): string[] {
  const linhas = [`🏆 *TOP FIVE · ${titulo}*`];
  for (const { mes, ate } of meses) {
    const nome = nomeDoMes(mes);
    linhas.push(`*${nome.charAt(0).toUpperCase() + nome.slice(1)}*`);
    const top = topDoMes(vendas, mes, ate, nomeDe);
    if (top.length === 0) linhas.push("• sem vendas com esse dado");
    top.forEach((t, i) =>
      linhas.push(`${MEDALHAS[i]} ${t.nome} · ${t.vendas} venda${t.vendas === 1 ? "" : "s"} · ${formatCentsBRL(t.cents).replace(/ /g, " ")}`)
    );
  }
  return linhas;
}

function secaoTopFive(vendas: VendaDoRelatorio[], dia: string): string[] {
  const mes = mesDe(dia);
  const mes1 = mesDe(addDaysISO(`${mes}-01`, -1));
  const mes2 = mesDe(addDaysISO(`${mes1}-01`, -1));
  const meses = [
    { mes, ate: dia },
    { mes: mes1, ate: "9999-12-31" },
    { mes: mes2, ate: "9999-12-31" },
  ];
  return [
    ...blocoDoRanking("Peças", meses, vendas, nomeDaPeca),
    "",
    ...blocoDoRanking("Fornecedores", meses, vendas, (v) => (v.supplier || "").trim()),
  ];
}

export interface ClienteDoRelatorio {
  id: number;
  full_name: string;
  phone?: string | null;
  birthday?: string | null; // AAAA-MM-DD
  city?: string | null;
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
  clientes?: ClienteDoRelatorio[]; // cadastro de clientes (sem isso, a seção de clientes não aparece)
  geradoEm?: string; // ISO: quando o relatório foi montado
  ultimaVendaLida?: { postadaEm: string; cliente: string | null } | null; // última mensagem de venda que o Roberto lançou
}

/** "2026-11-07T19:53:16Z" vira "07/11 às 16:53" (horário de Recife, UTC-3). */
export function dataHoraRecife(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)} às ${d.slice(11, 16)}`;
}

const MAX_NOMES = 10;

function listaDeNomes(nomes: string[]): string {
  if (nomes.length <= MAX_NOMES) return nomes.join(", ");
  return `${nomes.slice(0, MAX_NOMES).join(", ")} e mais ${nomes.length - MAX_NOMES}`;
}

/** Quem comprou num mês: o cadastro, quando a venda está ligada a um; senão, o nome escrito na venda. */
function compradoresDoMes(vendas: VendaDoRelatorio[], mes: string, ateODia: string): number {
  const quem = new Set<string>();
  for (const v of vendas) {
    const d = String(v.sale_date).slice(0, 10);
    if (!ativa(v) || mesDe(d) !== mes || d > ateODia) continue;
    if (v.client_id) quem.add(`id:${v.client_id}`);
    else if (v.client_name) quem.add(`nome:${v.client_name.trim().toLowerCase()}`);
  }
  return quem.size;
}

function secaoDeClientes(clientes: ClienteDoRelatorio[], vendas: VendaDoRelatorio[], dia: string): string[] {
  const linhas: string[] = [];
  const mes = mesDe(dia);
  const mes1 = mesDe(addDaysISO(`${mes}-01`, -1));
  const mes2 = mesDe(addDaysISO(`${mes1}-01`, -1));
  const rotulo = (m: string) => nomeDoMes(m);

  linhas.push(`👥 *Clientes:* ${clientes.length} cadastrado${clientes.length === 1 ? "" : "s"}`);
  linhas.push(
    `🛒 Compraram: ${rotulo(mes)} ${compradoresDoMes(vendas, mes, dia)} · ` +
      `${rotulo(mes1)} ${compradoresDoMes(vendas, mes1, "9999-12-31")} · ` +
      `${rotulo(mes2)} ${compradoresDoMes(vendas, mes2, "9999-12-31")}`
  );

  // Cadastro incompleto: sem telefone ou sem aniversário (os dois que o relatório e as campanhas usam).
  const incompletos = clientes
    .map((c) => {
      const falta: string[] = [];
      if (!c.phone || String(c.phone).replace(/\D/g, "").length < 10) falta.push("telefone");
      if (!c.birthday) falta.push("aniversário");
      return { nome: c.full_name, falta };
    })
    .filter((c) => c.falta.length > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (incompletos.length > 0) {
    linhas.push(`📝 Cadastro a completar: ${incompletos.length}`);
    const semOsDois = incompletos.filter((c) => c.falta.length === 2).map((c) => c.nome);
    const semTelefone = incompletos.filter((c) => c.falta.length === 1 && c.falta[0] === "telefone").map((c) => c.nome);
    const semAniversario = incompletos.filter((c) => c.falta.length === 1 && c.falta[0] === "aniversário").map((c) => c.nome);
    if (semOsDois.length) linhas.push(`• Sem telefone e aniversário: ${listaDeNomes(semOsDois)}`);
    if (semTelefone.length) linhas.push(`• Sem telefone: ${listaDeNomes(semTelefone)}`);
    if (semAniversario.length) linhas.push(`• Sem aniversário: ${listaDeNomes(semAniversario)}`);
  } else {
    linhas.push("📝 Todos os cadastros estão completos.");
  }

  // Aniversariantes: hoje, nos próximos 7 dias e no mês.
  const mmdd = (d: string) => d.slice(5, 10);
  const comAniversario = clientes
    .filter((c) => c.birthday && /^\d{4}-\d{2}-\d{2}/.test(String(c.birthday)))
    .map((c) => ({ nome: c.full_name, md: mmdd(String(c.birthday)) }));
  const proximos7 = new Set(Array.from({ length: 7 }, (_, i) => mmdd(addDaysISO(dia, i + 1))));
  const hoje = comAniversario.filter((c) => c.md === mmdd(dia)).map((c) => c.nome);
  const semana = comAniversario
    .filter((c) => proximos7.has(c.md))
    .sort((a, b) => a.md.localeCompare(b.md))
    .map((c) => `${c.nome} (${c.md.slice(3, 5)}/${c.md.slice(0, 2)})`);
  const doMes = comAniversario
    .filter((c) => c.md.slice(0, 2) === mmdd(dia).slice(0, 2))
    .sort((a, b) => a.md.localeCompare(b.md))
    .map((c) => `${c.nome} (${c.md.slice(3, 5)})`);
  linhas.push("🎂 *Aniversariantes*");
  linhas.push(`• Hoje: ${hoje.length ? listaDeNomes(hoje) : "ninguém"}`);
  linhas.push(`• Próximos 7 dias: ${semana.length ? listaDeNomes(semana) : "ninguém"}`);
  linhas.push(`• No mês: ${doMes.length ? listaDeNomes(doMes) : "ninguém"}`);
  return linhas;
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
  if (dados.geradoEm) linhas.push(`🕒 Dados até ${dataHoraRecife(dados.geradoEm)}`);
  if (dados.ultimaVendaLida) {
    const quem = dados.ultimaVendaLida.cliente ? ` (${dados.ultimaVendaLida.cliente})` : "";
    linhas.push(`✅ Última venda do grupo lida: ${dataHoraRecife(dados.ultimaVendaLida.postadaEm)}${quem}`);
    linhas.push("_Se alguma venda postada até esse horário não aparece aqui, avise._");
  }
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
  linhas.push(...secaoTopFive(dados.vendas, dia));

  if (dados.clientes) {
    linhas.push("");
    linhas.push(...secaoDeClientes(dados.clientes, dados.vendas, dia));
  }

  linhas.push("");
  linhas.push("_Enviado automaticamente pelo Radar de Vendas._");
  return linhas.join("\n");
}
