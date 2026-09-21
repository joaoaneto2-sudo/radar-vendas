import { formatCentsBRL, toCents } from "./finance/money";

// Histórico de alterações: transforma as linhas cruas do registro (o que o banco guardou de cada
// edição ou exclusão) em frases e comparações que o João consegue ler. Não fala com o banco.

export type Linha = Record<string, unknown>;

export interface LinhaDoLog {
  id: number;
  at: string; // ISO
  txId: string; // tudo o que mudou junto, numa mesma operação, tem o mesmo txId
  table: string;
  rowId: number | null;
  op: "UPDATE" | "DELETE";
  before: Linha;
  after: Linha | null;
  userName: string | null;
  desfeitaEm: string | null; // ISO, quando alguém desfez esta mudança
  desfeitaPor: string | null;
}

export interface Alteracao {
  rotulo: string;
  antes: string;
  depois: string;
}

export interface Campo {
  rotulo: string;
  valor: string;
}

export interface Relacionado {
  tabela: string; // nome em português
  acao: string;
  titulo: string;
  alteracoes: Alteracao[]; // só nas edições
}

export interface Evento {
  logId: number; // id da linha principal do registro (é o que o "Desfazer" usa)
  desfazivel: boolean; // dá para tentar desfazer (o servidor ainda confere se os dados de hoje deixam)
  desfeita: { em: string; por: string | null } | null;
  txId: string;
  at: string;
  userName: string | null;
  table: string;
  tipo: TipoDeRegistro;
  acao: "editada" | "apagada" | "cancelada" | "reativada";
  titulo: string;
  alteracoes: Alteracao[]; // só nas edições
  apagado: Campo[]; // só nas exclusões: o que existia
  relacionados: Relacionado[];
}

// O filtro da tela usa estes grupos, não o nome das tabelas.
export type TipoDeRegistro = "venda" | "recebimento" | "despesa" | "fatura" | "fundo" | "divida" | "compra";

const TIPO_DA_TABELA: Record<string, TipoDeRegistro> = {
  sales: "venda",
  sale_payments: "venda",
  receipts: "recebimento",
  expenses: "despesa",
  card_invoices: "fatura",
  card_invoice_parts: "fatura",
  fund_payments: "fundo",
  liabilities: "divida",
  liability_payments: "divida",
  stock_purchases: "compra",
};

export const ROTULO_DO_TIPO: Record<TipoDeRegistro, string> = {
  venda: "Vendas e parcelas",
  recebimento: "Recebimentos",
  despesa: "Despesas",
  fatura: "Faturas do cartão",
  fundo: "Fundo de reposição",
  divida: "Dívidas",
  compra: "Compras de estoque",
};

export const TABELAS_REGISTRADAS = Object.keys(TIPO_DA_TABELA);

// O que dá para desfazer, por enquanto: só os casos simples, em que a operação mexeu numa linha só.
// Desfazer a exclusão de uma venda ou de uma fatura devolveria também parcelas, despesas e estoque: fica para depois.
export const DESFAZIVEIS: Record<string, Array<"UPDATE" | "DELETE">> = {
  expenses: ["UPDATE", "DELETE"],
  receipts: ["UPDATE", "DELETE"],
  fund_payments: ["DELETE"],
  sale_payments: ["UPDATE"], // marcar uma parcela como recebida (ou voltar para a receber)
};

/** Uma mudança pode ser desfeita se é de um tipo simples, foi a única da operação e ainda não foi desfeita. */
export function podeDesfazerLinha(l: LinhaDoLog, linhasDaOperacao: number): boolean {
  return linhasDaOperacao === 1 && !l.desfeitaEm && (DESFAZIVEIS[l.table] ?? []).includes(l.op);
}

const NOME_DA_TABELA: Record<string, string> = {
  sales: "Venda",
  sale_payments: "Parcela",
  receipts: "Recebimento",
  expenses: "Despesa",
  card_invoices: "Fatura do cartão",
  card_invoice_parts: "Parte da fatura",
  fund_payments: "Pagamento do fundo",
  liabilities: "Dívida",
  liability_payments: "Pagamento de dívida",
  stock_purchases: "Compra de estoque",
};

// Qual linha manda no título quando várias mudam juntas (apagar uma venda leva as parcelas junto).
const PRIORIDADE = [
  "sales",
  "card_invoices",
  "receipts",
  "expenses",
  "fund_payments",
  "liabilities",
  "sale_payments",
  "card_invoice_parts",
  "liability_payments",
  "stock_purchases",
];

const ROTULOS: Record<string, string> = {
  sale_date: "Data da venda",
  sale_type: "Tipo de venda",
  seller: "Vendedora",
  product_type: "Peça",
  manufacturer: "Fabricante",
  supplier: "Fornecedor",
  warranty: "Garantia",
  cost: "Custo",
  sale_value: "Valor da venda",
  payment_method: "Forma de pagamento",
  installments_count: "Número de parcelas",
  installments_dates: "Datas das parcelas",
  client_name: "Cliente",
  client_nickname: "Apelido",
  client_city: "Cidade",
  client_phone: "Telefone",
  client_birthday: "Aniversário",
  price_tier: "Tipo de preço",
  sale_costs: "Custos da venda",
  payment_fee: "Taxa de pagamento",
  status: "Situação",
  cancelled_at: "Cancelada em",
  stock_received_date: "Estoque recebido em",
  gross_value: "Valor cheio",
  discount_pct: "Desconto",
  cashback_pct: "Cashback",
  cashback_earned: "Cashback ganho",
  cashback_used: "Cashback usado",
  due_date: "Vencimento",
  amount: "Valor",
  received_date: "Data do recebimento",
  expected_date: "Previsto para",
  note: "Observação",
  notes: "Observação",
  kind: "Tipo",
  partner: "Sócio",
  from_name: "De quem",
  from_nickname: "Apelido",
  reason: "Motivo",
  expense_date: "Data",
  description: "Descrição",
  category: "Categoria",
  closing_date: "Fechamento",
  total_amount: "Total",
  paid_date: "Data do pagamento",
  nature: "Natureza",
  purchase_date: "Data da compra",
  responsible: "Responsável",
};

const DINHEIRO = new Set([
  "cost",
  "sale_value",
  "sale_costs",
  "payment_fee",
  "gross_value",
  "cashback_earned",
  "cashback_used",
  "amount",
  "total_amount",
]);
const PORCENTAGEM = new Set(["discount_pct", "cashback_pct"]);
// Campos que guardam uma opção (recebida, outra_receita, ...): mostrados como texto normal.
const ROTULOS_DE_LISTA = new Set(["status", "price_tier", "kind", "nature", "partner"]);
const IGNORADOS = new Set(["id", "created_at", "updated_at"]);

export function tipoDaTabela(tabela: string): TipoDeRegistro | null {
  return TIPO_DA_TABELA[tabela] ?? null;
}

export function rotuloDoCampo(campo: string): string {
  if (ROTULOS[campo]) return ROTULOS[campo];
  return campo.replace(/_/g, " ");
}

function dataBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** O valor de um campo como o João lê: dinheiro em R$, data em dd/mm/aaaa, vazio quando não há nada. */
export function valorLegivel(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "vazio";
  if (DINHEIRO.has(campo)) {
    const n = Number(valor);
    return Number.isFinite(n) ? formatCentsBRL(toCents(n)) : String(valor);
  }
  if (PORCENTAGEM.has(campo)) {
    const n = Number(valor);
    return Number.isFinite(n) ? `${String(n).replace(".", ",")}%` : String(valor);
  }
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) return dataBR(valor);
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  const texto = typeof valor === "object" ? JSON.stringify(valor) : String(valor);
  if (ROTULOS_DE_LISTA.has(campo)) {
    const legivel = texto.replace(/_/g, " ");
    return legivel.charAt(0).toUpperCase() + legivel.slice(1);
  }
  return texto;
}

const texto = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(v));
// Valor em reais, ou nada quando o campo está vazio (o título não mostra "R$ vazio").
const dinheiro = (linha: Linha, campo: string) => (texto(linha[campo]) ? valorLegivel(campo, linha[campo]) : "");
const junta = (...partes: string[]) => partes.filter(Boolean).join(", ");
const em = (linha: Linha, campo: string, prefixo: string) => (linha[campo] ? `${prefixo} ${valorLegivel(campo, linha[campo])}` : "");

/** Frase curta que identifica a linha ("Despesa "Frete", R$ 30,00"). */
export function tituloDaLinha(tabela: string, l: Linha): string {
  const nome = NOME_DA_TABELA[tabela] ?? tabela;
  switch (tabela) {
    case "sales": {
      const cliente = texto(l.client_name);
      return junta(`${nome}${cliente ? ` de ${cliente}` : ""}`, dinheiro(l, "sale_value"), em(l, "sale_date", "em"));
    }
    case "sale_payments":
      return junta(`${nome}${dinheiro(l, "amount") ? ` de ${dinheiro(l, "amount")}` : ""}`, em(l, "due_date", "vence em"));
    case "receipts": {
      const quem = texto(l.from_name);
      return junta(`${nome}${quem ? ` de ${quem}` : ""}`, dinheiro(l, "amount"));
    }
    case "expenses":
    case "stock_purchases":
    case "card_invoice_parts":
    case "liabilities": {
      const descricao = texto(l.description);
      return junta(`${nome}${descricao ? ` "${descricao}"` : ""}`, dinheiro(l, tabela === "liabilities" ? "total_amount" : "amount"));
    }
    case "card_invoices": {
      const descricao = texto(l.description);
      return junta(`${nome}${descricao ? ` "${descricao}"` : ""}`, dinheiro(l, "total_amount"));
    }
    case "fund_payments":
    case "liability_payments":
      return junta(nome, dinheiro(l, "amount"), em(l, "paid_date", "em"));
    default:
      return nome;
  }
}

/** O que mudou de um estado para o outro (só os campos que realmente mudaram). */
export function alteracoesEntre(antes: Linha, depois: Linha): Alteracao[] {
  const chaves = Array.from(new Set([...Object.keys(antes), ...Object.keys(depois)])).filter((c) => !IGNORADOS.has(c) && !c.endsWith("_id"));
  const lista: Alteracao[] = [];
  for (const campo of chaves) {
    const a = valorLegivel(campo, antes[campo]);
    const d = valorLegivel(campo, depois[campo]);
    if (a !== d) lista.push({ rotulo: rotuloDoCampo(campo), antes: a, depois: d });
  }
  return lista;
}

/** O que existia numa linha apagada (sem os campos de ligação e os vazios). */
export function camposDaLinha(l: Linha): Campo[] {
  return Object.keys(l)
    .filter((c) => !IGNORADOS.has(c) && !c.endsWith("_id"))
    .filter((c) => l[c] !== null && l[c] !== undefined && l[c] !== "")
    .map((c) => ({ rotulo: rotuloDoCampo(c), valor: valorLegivel(c, l[c]) }));
}

function acaoDe(l: LinhaDoLog): Evento["acao"] {
  if (l.op === "DELETE") return "apagada";
  if (l.table === "sales" && l.after && l.before.status !== l.after.status) {
    return l.after.status === "cancelada" ? "cancelada" : "reativada";
  }
  return "editada";
}

const prioridade = (tabela: string) => {
  const i = PRIORIDADE.indexOf(tabela);
  return i === -1 ? PRIORIDADE.length : i;
};

/**
 * Junta as linhas do registro em eventos: cada operação do João vira um evento só.
 * As linhas que mudaram por consequência (as parcelas de uma venda apagada) ficam como "relacionados".
 * Devolve do mais novo para o mais antigo.
 */
export function agruparEventos(linhas: LinhaDoLog[]): Evento[] {
  const grupos = new Map<string, LinhaDoLog[]>();
  for (const l of linhas) {
    const g = grupos.get(l.txId);
    if (g) g.push(l);
    else grupos.set(l.txId, [l]);
  }

  const mudancasDe = (l: LinhaDoLog): Alteracao[] => (l.op === "UPDATE" && l.after ? alteracoesEntre(l.before, l.after) : []);

  const eventos: Evento[] = [];
  for (const grupo of grupos.values()) {
    const ordenado = [...grupo].sort((a, b) => prioridade(a.table) - prioridade(b.table) || a.id - b.id);
    const [principal, ...resto] = ordenado;
    const tipo = tipoDaTabela(principal.table);
    if (!tipo) continue;

    // Só mudou uma ligação interna (ex.: a fatura ligou uma despesa à sua parte): não é algo que o João fez, não aparece.
    const algoVisivel = grupo.some((l) => l.op === "DELETE" || mudancasDe(l).length > 0);
    if (!algoVisivel) continue;

    eventos.push({
      logId: principal.id,
      desfazivel: podeDesfazerLinha(principal, grupo.length),
      desfeita: principal.desfeitaEm ? { em: principal.desfeitaEm, por: principal.desfeitaPor } : null,
      txId: principal.txId,
      at: grupo.reduce((mais, l) => (l.at > mais ? l.at : mais), principal.at),
      userName: grupo.find((l) => l.userName)?.userName ?? null,
      table: principal.table,
      tipo,
      acao: acaoDe(principal),
      titulo: tituloDaLinha(principal.table, principal.op === "DELETE" ? principal.before : principal.after ?? principal.before),
      alteracoes: mudancasDe(principal),
      apagado: principal.op === "DELETE" ? camposDaLinha(principal.before) : [],
      relacionados: resto
        .filter((r) => r.op === "DELETE" || mudancasDe(r).length > 0)
        .map((r) => ({
          tabela: NOME_DA_TABELA[r.table] ?? r.table,
          // Ao editar uma venda, o sistema apaga as parcelas antigas e grava as novas: aqui elas aparecem como "substituída".
          acao: principal.op === "UPDATE" && r.op === "DELETE" ? "substituída" : acaoDe(r),
          titulo: tituloDaLinha(r.table, r.op === "DELETE" ? r.before : r.after ?? r.before),
          alteracoes: mudancasDe(r),
        })),
    });
  }
  return eventos.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** "21/09/2026 às 02:12", no horário da Bahia. */
export function quandoBR(iso: string): string {
  const d = new Date(iso);
  const dia = dataBR(new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString());
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bahia" });
  return `${dia} às ${hora}`;
}
