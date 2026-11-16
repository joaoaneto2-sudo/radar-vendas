import { toCents, type Cents } from "./finance/money";
import { addDaysISO } from "./finance/dates";
import { valorVendido, type VendaLinha } from "./dashboard";

// Meta dos cartões (regras do João em 11/11/2026).
// PLANO PRINCIPAL: toda venda de varejo desde 01/11 é dividida: 10% guardados para a Riachuelo
// (vence 13/11) e 90% para a Santander (vence 02/12).
// SUGESTÃO (para não pagar juros): usar o caixa inteiro para pagar a Riachuelo no vencimento e
// juntar a sobra com as vendas seguintes para pagar a Santander inteira em 02/12.
// Nos dois casos, o dinheiro de cada vencimento conta até as 20h do próprio dia do vencimento
// (o dia do vencimento é dia de venda). Conta o VALOR VENDIDO (parcelado pelo total), sem atacado
// (pago direto ao fabricante) e sem vendas canceladas.

export interface Cartao {
  nome: string;
  totalCents: Cents;
  parte: number; // fração de cada venda guardada para este cartão no plano principal
  vence: string; // AAAA-MM-DD
  desde?: string; // vendas que contam para esta fatura começam neste dia (padrão: INICIO_META_CARTOES)
  // Fica com o caixa que sobra depois das outras faturas em aberto (vendas menos comissões menos
  // pagamentos já feitos menos o guardado das outras). As vendas novas entram pela "parte".
  resto?: boolean;
}

/** Pagamento de fatura já feito com o dinheiro das vendas (sai do caixa da meta). */
export interface PagamentoFeito {
  date: string; // AAAA-MM-DD
  cartao: string; // nome do cartão em CARTOES, ou outra fatura
  descricao: string;
  cents: Cents;
}

// João, 16/11/2026: tirar do caixa o pagamento feito na Riachuelo e os R$ 500 que faltavam da
// fatura Santander de 02/11. (Renner, Studio Z e Sam's foram pagos com dinheiro do pai da
// Fernanda, não da empresa: NÃO entram.)
export const PAGAMENTOS_FEITOS: PagamentoFeito[] = [
  { date: "2026-11-02", cartao: "Santander (02/11)", descricao: "Resto da fatura Santander de 02/11", cents: toCents("500.00") },
  { date: "2026-11-13", cartao: "Riachuelo", descricao: "Fatura Riachuelo de 13/11 (o resto foi parcelado)", cents: toCents("1290.00") },
];

export const INICIO_META_CARTOES = "2026-11-01";

/**
 * Comissão paga às funcionárias num dia (despesa da categoria comissao_funcionarias).
 * João, 16/11/2026: "subtraia diariamente os valores pagos de comissão" do caixa da meta.
 */
export interface ComissaoPaga {
  date: string; // AAAA-MM-DD
  cents: Cents;
}

export const CARTOES: Cartao[] = [
  // Valores da fatura da Riachuelo (cartão final 3108) de 13/11/2026: saldo R$ 2.290,68;
  // próxima fatura (13/12) R$ 1.853,16 = parcelas R$ 1.837,17 + anuidade R$ 15,99.
  { nome: "Riachuelo", totalCents: toCents("2290.68"), parte: 0.1, vence: "2026-11-13" },
  { nome: "Santander", totalCents: toCents("11500.00"), parte: 0.9, vence: "2026-12-02", resto: true },
  // A Riachuelo de dezembro junta os 10% das vendas feitas depois do vencimento de novembro.
  { nome: "Riachuelo (dez)", totalCents: toCents("1853.16"), parte: 0.1, vence: "2026-12-13", desde: "2026-11-14" },
];

/** Dias normais de trabalho: terça (2) a sábado (6). */
const DIAS_DE_TRABALHO = new Set([2, 3, 4, 5, 6]);
const diaDaSemana = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** Dias de venda depois de `dia` até `vence`, contando o próprio vencimento (dinheiro até as 20h). */
export function diasDeVendaAte(dia: string, vence: string): number {
  let n = 0;
  for (let d = addDaysISO(dia, 1); d <= vence; d = addDaysISO(d, 1)) {
    if (DIAS_DE_TRABALHO.has(diaDaSemana(d))) n += 1; // a Fernanda não trabalha domingo nem segunda
  }
  return n;
}

const porDia = (c: Cents, dias: number) => (dias > 0 ? Math.ceil(c / dias) : c);

/**
 * Dias trabalhados de `inicio` até `dia`: só os dias que tiveram venda lançada.
 * (João, 12/11/2026: em 10/11 a Fernanda não trabalhou; dia sem venda não conta para a média.)
 */
export function diasTrabalhadosDesde(inicio: string, dia: string, diasComVenda: Set<string>): number {
  return [...diasComVenda].filter((d) => d >= inicio && d <= dia).length;
}

export interface SituacaoDoCartao {
  nome: string;
  totalCents: Cents;
  parte: number;
  vence: string;
  guardadoCents: Cents; // parte das vendas reservada para este cartão
  faltaGuardarCents: Cents;
  precisaVenderCents: Cents; // total de vendas ainda necessário até as 20h do vencimento
  diasDeVenda: number;
  precisaPorDiaCents: Cents;
  vencido: boolean;
  quitado: boolean;
  pagoCents: Cents; // pagamentos já feitos para esta fatura (PAGAMENTOS_FEITOS)
  pagoEm: string | null;
  // Previsão pela média diária: o guardado no vencimento se as vendas seguirem a média.
  previsaoGuardadoCents: Cents;
  previsaoSaldoCents: Cents; // positivo = sobra; negativo = falta
}

export interface SugestaoCaixaUnico {
  primeiro: string; // cartão pago primeiro com o caixa
  primeiroCoberto: boolean;
  faltaPrimeiroCents: Cents; // se o caixa ainda não cobre o primeiro cartão
  ultimo: string;
  ultimoVence: string;
  sobraDepoisDoPrimeiroCents: Cents;
  precisaVenderCents: Cents; // até as 20h do último vencimento, para pagar as duas faturas inteiras
  diasDeVenda: number;
  precisaPorDiaCents: Cents;
  previsaoNoVencimentoCents: Cents; // caixa previsto no último vencimento pela média
  previsaoSaldoCents: Cents; // previsto menos as duas faturas (positivo = sobra)
}

export interface MetaDosCartoes {
  inicio: string;
  vendidoCents: Cents; // valor vendido desde o início
  comissoesCents: Cents; // comissões pagas às funcionárias desde o início
  pagamentos: PagamentoFeito[]; // faturas já pagas com o caixa, até o dia
  pagamentosCents: Cents;
  acumuladoCents: Cents; // caixa da meta = vendido menos comissões menos pagamentos já feitos
  vendas: number;
  mediaPorDiaCents: Cents; // média vendida por dia trabalhado desde o início
  diasTrabalhados: number;
  cartoes: SituacaoDoCartao[];
  sugestao: SugestaoCaixaUnico | null; // null quando o primeiro cartão já venceu
  projecaoDoCaixa: PassoDoCaixa[]; // pagando cada fatura inteira no vencimento, vendendo na média
}

/** Um vencimento na projeção do caixa (valor vendido), pagando tudo em dia e vendendo na média. */
export interface PassoDoCaixa {
  nome: string;
  vence: string;
  totalCents: Cents;
  diasDeVenda: number; // desde o passo anterior (ou desde hoje) até as 20h do vencimento
  entraCents: Cents; // vendas previstas nesses dias pela média
  noVencimentoCents: Cents; // caixa às 20h do vencimento, antes de pagar
  depoisDePagarCents: Cents; // caixa depois de pagar a fatura inteira (negativo = faltaria)
}

export function metaDosCartoes(
  vendas: VendaLinha[],
  dia: string,
  cartoes: Cartao[] = CARTOES,
  inicio: string = INICIO_META_CARTOES,
  comissoes: ComissaoPaga[] = [],
  pagamentosFeitos: PagamentoFeito[] = []
): MetaDosCartoes {
  const contam = vendas.filter((v) => {
    const d = String(v.sale_date).slice(0, 10);
    return v.status !== "cancelada" && v.price_tier !== "atacado" && d >= inicio && d <= dia;
  });
  const pagas = comissoes.filter((c) => c.date >= inicio && c.date <= dia);
  const comissoesDesde = (de: string) => pagas.filter((c) => c.date >= de).reduce((t, c) => t + c.cents, 0);
  const vendidoCents = contam.reduce((t, v) => t + valorVendido(v), 0);
  const comissoesCents = comissoesDesde(inicio);
  const pagamentos = pagamentosFeitos.filter((p) => p.date >= inicio && p.date <= dia);
  const pagamentosCents = pagamentos.reduce((t, p) => t + p.cents, 0);
  const acumuladoCents = vendidoCents - comissoesCents - pagamentosCents;
  const diasComVenda = new Set(contam.map((v) => String(v.sale_date).slice(0, 10)));
  const diasTrabalhados = diasTrabalhadosDesde(inicio, dia, diasComVenda);
  const mediaPorDiaCents = diasTrabalhados > 0 ? Math.round(acumuladoCents / diasTrabalhados) : 0;
  const previsto = (dias: number) => acumuladoCents + mediaPorDiaCents * dias;
  const ordem = [...cartoes].sort((a, b) => a.vence.localeCompare(b.vence));

  // Caixa de cada fatura: vendido desde o "desde" dela menos as comissões pagas no mesmo período.
  const vendidoDesde = (de: string) =>
    contam.filter((v) => String(v.sale_date).slice(0, 10) >= de).reduce((t, v) => t + valorVendido(v), 0) -
    comissoesDesde(de);
  const situacoes = ordem.map((c) => {
    const desde = c.desde ?? inicio;
    const acumuladoDoCartao = vendidoDesde(desde);
    const guardadoCents = Math.max(0, Math.round(acumuladoDoCartao * c.parte));
    const faltaGuardarCents = Math.max(0, c.totalCents - guardadoCents);
    const precisaVenderCents = c.parte > 0 ? Math.ceil(faltaGuardarCents / c.parte) : 0;
    // Os dias de venda desta fatura começam no maior entre amanhã e o "desde" dela.
    const aPartir = desde > dia ? addDaysISO(desde, -1) : dia;
    const diasDeVenda = diasDeVendaAte(aPartir, c.vence);
    const previstoNoVencimento = acumuladoDoCartao + mediaPorDiaCents * diasDeVenda;
    return {
      nome: c.nome,
      totalCents: c.totalCents,
      parte: c.parte,
      vence: c.vence,
      guardadoCents,
      faltaGuardarCents,
      precisaVenderCents,
      diasDeVenda,
      precisaPorDiaCents: porDia(precisaVenderCents, diasDeVenda),
      vencido: dia > c.vence,
      quitado: faltaGuardarCents === 0,
      pagoCents: pagamentos.filter((p) => p.cartao === c.nome).reduce((t, p) => t + p.cents, 0),
      pagoEm: pagamentos.filter((p) => p.cartao === c.nome).map((p) => p.date).sort().pop() ?? null,
      previsaoGuardadoCents: Math.round(previstoNoVencimento * c.parte),
      previsaoSaldoCents: Math.round(previstoNoVencimento * c.parte) - c.totalCents,
    };
  });

  // A fatura "resto" fica com o caixa que sobra depois do guardado das outras em aberto.
  ordem.forEach((c, i) => {
    if (!c.resto) return;
    const s = situacoes[i];
    if (s.vencido) return;
    const dasOutras = situacoes.filter((o, j) => j !== i && !o.vencido).reduce((t, o) => t + o.guardadoCents, 0);
    s.guardadoCents = Math.max(0, acumuladoCents - dasOutras);
    s.faltaGuardarCents = Math.max(0, c.totalCents - s.guardadoCents);
    s.precisaVenderCents = c.parte > 0 ? Math.ceil(s.faltaGuardarCents / c.parte) : 0;
    s.precisaPorDiaCents = porDia(s.precisaVenderCents, s.diasDeVenda);
    s.quitado = s.faltaGuardarCents === 0;
    s.previsaoGuardadoCents = s.guardadoCents + Math.round(mediaPorDiaCents * s.diasDeVenda * c.parte);
    s.previsaoSaldoCents = s.previsaoGuardadoCents - c.totalCents;
  });

  // Projeção do caixa: tudo o que foi vendido é um caixa só; as faturas que já venceram são
  // consideradas pagas; as próximas são pagas inteiras no vencimento, vendendo na média.
  const projecaoDoCaixa: PassoDoCaixa[] = [];
  // Fatura vencida com pagamento lançado já saiu do caixa pelo pagamento; sem pagamento, conta a fatura inteira.
  const pagaPorLancamento = (c: Cartao) => pagamentos.some((p) => p.cartao === c.nome);
  let caixa = acumuladoCents - ordem.filter((c) => c.vence < dia && !pagaPorLancamento(c)).reduce((t, c) => t + c.totalCents, 0);
  let desdeODia = dia;
  for (const c of ordem.filter((x) => x.vence >= dia)) {
    const diasDeVenda = diasDeVendaAte(desdeODia, c.vence);
    const entraCents = mediaPorDiaCents * diasDeVenda;
    const noVencimentoCents = caixa + entraCents;
    const depoisDePagarCents = noVencimentoCents - c.totalCents;
    projecaoDoCaixa.push({ nome: c.nome, vence: c.vence, totalCents: c.totalCents, diasDeVenda, entraCents, noVencimentoCents, depoisDePagarCents });
    caixa = depoisDePagarCents;
    desdeODia = c.vence;
  }

  let sugestao: SugestaoCaixaUnico | null = null;
  if (ordem.length >= 2 && dia <= ordem[0].vence) {
    const primeiro = ordem[0];
    const ultimo = ordem[1];
    const totalFaturas = primeiro.totalCents + ultimo.totalCents;
    const precisaVenderCents = Math.max(0, totalFaturas - acumuladoCents);
    const diasDeVenda = diasDeVendaAte(dia, ultimo.vence);
    sugestao = {
      primeiro: primeiro.nome,
      primeiroCoberto: acumuladoCents >= primeiro.totalCents,
      faltaPrimeiroCents: Math.max(0, primeiro.totalCents - acumuladoCents),
      ultimo: ultimo.nome,
      ultimoVence: ultimo.vence,
      sobraDepoisDoPrimeiroCents: Math.max(0, acumuladoCents - primeiro.totalCents),
      precisaVenderCents,
      diasDeVenda,
      precisaPorDiaCents: porDia(precisaVenderCents, diasDeVenda),
      previsaoNoVencimentoCents: previsto(diasDeVenda),
      previsaoSaldoCents: previsto(diasDeVenda) - totalFaturas,
    };
  }

  return { inicio, vendidoCents, comissoesCents, pagamentos, pagamentosCents, acumuladoCents, vendas: contam.length, mediaPorDiaCents, diasTrabalhados, cartoes: situacoes, sugestao, projecaoDoCaixa };
}

/** Comissões pagas às funcionárias, a partir das despesas (categoria comissao_funcionarias). */
export function comissoesDasDespesas(
  despesas: { expense_date: string; amount: string | number; category?: string | null }[]
): ComissaoPaga[] {
  return despesas
    .filter((d) => d.category === "comissao_funcionarias")
    .map((d) => ({ date: String(d.expense_date).slice(0, 10), cents: toCents(d.amount) }));
}
