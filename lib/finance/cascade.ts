import { Cents, pctOf, roundDiv } from "./money";

// A "cascata" é a divisão do que entra na sociedade: fundo de reposição, custos,
// despesas, Fernanda, João e o abatimento da dívida do João pelo estoque inicial.
// Este arquivo não fala com o banco: recebe os dados e devolve as contas.
// Assim dá para testar com números conhecidos.
//
// Regras (acordadas com o João):
// - Varejo: reposição de 30% (configurável). Consignado: reposição própria (30% por padrão).
// - Atacado: o cliente paga direto ao fabricante. A receita da sociedade é só a COMISSÃO
//   (ex.: 20%), recebida depois. É sobre a comissão que se aplica o resto da cascata.
// - Custos da venda e despesas da empresa saem ANTES da divisão. Se não houver lucro para
//   cobrir naquele momento, ficam "a compensar" e são descontados dos próximos lucros.
// - O que sobra é dividido entre Fernanda e João. Enquanto o João deve o estoque inicial,
//   a parte dele é repassada à Fernanda e abate a dívida.

export type Tier = "varejo" | "atacado" | "consignado";
export type CascadeMode = "recebimento" | "venda";

export interface Settings {
  retailPct: number; // ex.: 30
  wholesalePct: number; // reposição sobre a comissão do atacado, ex.: 0
  consignmentPct: number; // reposição do consignado, ex.: 30
  joaoSharePct: number; // ex.: 50 (participação do João e divisão do lucro)
  initialStockCents: Cents; // ex.: 1500000
  mode: CascadeMode; // "recebimento" conta quando o dinheiro entra
}

export interface PaymentInput {
  id: number;
  dueDate: string | null; // AAAA-MM-DD, ou null enquanto não há data prevista
  amountCents: Cents;
  status: "prevista" | "recebida";
  receivedDate: string | null;
}

export interface SaleInput {
  id: number;
  date: string; // AAAA-MM-DD
  amountCents: Cents; // valor da venda ao cliente
  costsCents: Cents; // custos da venda, já somados com a taxa de cartão ou link
  tier: Tier;
  status: "ativa" | "cancelada";
  paymentMethod?: string | null;
  label?: string | null; // nome do cliente, só para mostrar na tela
  payments: PaymentInput[];
  // Só para atacado:
  manufacturerId?: number | null;
  manufacturerName?: string | null;
  commissionPct?: number | null; // % que fica com a sociedade; null se o fabricante não é representado
  commissionDays?: number | null; // dias depois de receber o estoque até o fabricante pagar
  stockReceivedDate?: string | null;
}

export interface JoaoPaymentInput {
  id: number;
  date: string;
  amountCents: Cents;
}

export interface ExpenseInput {
  id: number;
  date: string;
  amountCents: Cents;
  description?: string | null;
}

// Dinheiro que entra fora das vendas (livro de recebimentos):
// - aporte_socio: dinheiro que um sócio coloca; o do João abate a dívida, o da Fernanda só fica registrado;
// - comissao_fabricante: comissão paga por um fabricante representado (entra na divisão);
// - outra_receita: receita de outros ramos da empresa (entra na divisão).
// "prevista" é só lembrete: não entra em conta nenhuma.
export type ReceiptKind = "aporte_socio" | "comissao_fabricante" | "outra_receita";

export interface ReceiptInput {
  id: number;
  kind: ReceiptKind;
  status: "prevista" | "recebida";
  receivedDate: string | null;
  expectedDate: string | null;
  amountCents: Cents;
  partner?: "joao" | "fernanda" | null;
  manufacturerId?: number | null;
  manufacturerName?: string | null;
  fromName?: string | null;
  reason?: string | null;
}

export interface CascadeEvent {
  key: string; // "venda-12", "parcela-34", "despesa-5" ou "receita-7"
  kind: "venda" | "parcela" | "despesa" | "receita";
  tier: Tier | null;
  date: string;
  saleId: number; // 0 nas despesas e receitas
  paymentId: number | null;
  expenseId: number | null;
  receiptId: number | null;
  implicit: boolean; // true: não há parcela cadastrada, contamos como recebido na data da venda
  baseCents: Cents; // o que entrou (no atacado, a comissão)
  replenishCents: Cents;
  costsCents: Cents;
  expenseCents: Cents; // despesa da empresa lançada neste evento
  profitCents: Cents; // base menos reposição menos custos (pode ser negativo)
  compensatedCents: Cents; // parte do lucro usada para cobrir despesas e prejuízos anteriores
  lossCarriedCents: Cents; // prejuízo desta venda que passa para os próximos lucros
  distributableCents: Cents; // o que de fato é dividido entre os sócios
  carryAfterCents: Cents; // ainda a compensar depois deste evento
  joaoShareCents: Cents;
  fernandaShareCents: Cents;
  debtBeforeCents: Cents;
  abatementCents: Cents;
  joaoReceivesCents: Cents;
  fernandaReceivesCents: Cents;
  debtAfterCents: Cents;
}

export interface Warning {
  code: string;
  message: string;
  saleIds?: number[];
}

export interface CascadeResult {
  events: CascadeEvent[];
  totals: {
    soldCents: Cents; // total das vendas ativas de varejo e consignado (o atacado fica à parte)
    countedCents: Cents; // parte dessas vendas que já entrou na cascata
    pendingCents: Cents; // vendido que ainda não entrou (só no modo "recebimento")
    wholesaleCommissionCountedCents: Cents; // comissões do atacado que já entraram na cascata
    otherIncomeCountedCents: Cents; // outras receitas (outros ramos) que já entraram na cascata
    replenishCents: Cents;
    costsCents: Cents;
    expensesCents: Cents; // despesas da empresa lançadas
    profitCents: Cents; // soma dos lucros das vendas, antes das despesas
    compensatedCents: Cents;
    carryCents: Cents; // despesas e prejuízos ainda a compensar
    distributableCents: Cents; // o que foi dividido entre os sócios
    abatedCents: Cents;
    joaoReceivesCents: Cents;
    fernandaReceivesCents: Cents;
  };
  debt: {
    totalCents: Cents;
    paidDirectCents: Cents;
    abatedCents: Cents;
    balanceCents: Cents;
    excessPaidCents: Cents; // pagou além da dívida (a Fernanda ficaria devendo ao João)
    paidFraction: number; // 0 a 1
  };
  check: { fernandaPlusJoaoEqualsDistributable: boolean };
  warnings: Warning[];
}

interface RawEvent {
  key: string;
  kind: "venda" | "parcela" | "despesa" | "receita";
  date: string;
  saleId: number;
  paymentId: number | null;
  expenseId: number | null;
  receiptId: number | null;
  implicit: boolean;
  tier: Tier | null;
  baseCents: Cents;
  costsCents: Cents;
  expenseCents: Cents;
}

export function computeCascade(
  settings: Settings,
  sales: SaleInput[],
  joaoPayments: JoaoPaymentInput[],
  expenses: ExpenseInput[] = [],
  receipts: ReceiptInput[] = []
): CascadeResult {
  const warnings: Warning[] = [];
  const joaoBp = Math.round(settings.joaoSharePct * 100);
  const debtTotal = pctOf(settings.initialStockCents, settings.joaoSharePct);

  const semValor: number[] = [];
  const semForma: number[] = [];
  const atacadoSemFabricante: number[] = [];
  const parcelasDiferentes: number[] = [];
  const semDataDeRecebimento: number[] = [];
  const raw: RawEvent[] = [];
  let soldCents = 0;

  for (const sale of sales) {
    if (sale.status !== "ativa") continue;
    if (!sale.amountCents || sale.amountCents <= 0) {
      semValor.push(sale.id);
      continue;
    }

    const ehAtacado = sale.tier === "atacado";

    // No atacado, o que entra para a sociedade é só a comissão do fabricante.
    let base = sale.amountCents;
    if (ehAtacado) {
      if (sale.commissionPct === null || sale.commissionPct === undefined) {
        atacadoSemFabricante.push(sale.id);
        continue; // sem fabricante representado não dá para saber a comissão: fica fora das contas
      }
      base = pctOf(sale.amountCents, sale.commissionPct);
    } else {
      soldCents += sale.amountCents;
    }

    const semParcelas = sale.payments.length === 0;
    if (!ehAtacado && semParcelas && (!sale.paymentMethod || sale.paymentMethod === "Não informada")) {
      semForma.push(sale.id);
    }

    if (settings.mode === "venda") {
      raw.push({
        key: `venda-${sale.id}`,
        kind: "venda",
        date: sale.date,
        saleId: sale.id,
        paymentId: null,
        expenseId: null,
        receiptId: null,
        implicit: false,
        tier: sale.tier,
        baseCents: base,
        costsCents: sale.costsCents,
        expenseCents: 0,
      });
      continue;
    }

    // Modo "recebimento".
    // Atacado: a comissão só entra quando o fabricante paga, e isso vem dos recebimentos
    // lançados por fabricante (mais abaixo), não da venda.
    if (ehAtacado) continue;

    if (semParcelas) {
      // Varejo e consignado sem parcelas: contamos como recebido na data da venda.
      raw.push({
        key: `venda-${sale.id}`,
        kind: "venda",
        date: sale.date,
        saleId: sale.id,
        paymentId: null,
        expenseId: null,
        receiptId: null,
        implicit: true,
        tier: sale.tier,
        baseCents: base,
        costsCents: sale.costsCents,
        expenseCents: 0,
      });
      continue;
    }

    const parcelas = [...sale.payments].sort(
      (a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") || a.id - b.id
    );
    const totalParcelas = parcelas.reduce((soma, p) => soma + p.amountCents, 0);
    if (totalParcelas !== base) parcelasDiferentes.push(sale.id);

    // Os custos da venda são repartidos entre as parcelas na proporção do valor.
    // A última parcela leva a sobra de centavos, para a soma fechar certinho.
    let repartido = 0;
    parcelas.forEach((parcela, i) => {
      const ultima = i === parcelas.length - 1;
      const custo = ultima
        ? sale.costsCents - repartido
        : totalParcelas > 0
          ? roundDiv(sale.costsCents * parcela.amountCents, totalParcelas)
          : 0;
      repartido += custo;

      if (parcela.status !== "recebida") return;
      if (!parcela.receivedDate) semDataDeRecebimento.push(sale.id);
      raw.push({
        key: `parcela-${parcela.id}`,
        kind: "parcela",
        date: parcela.receivedDate ?? parcela.dueDate ?? sale.date,
        saleId: sale.id,
        paymentId: parcela.id,
        expenseId: null,
        receiptId: null,
        implicit: false,
        tier: sale.tier,
        baseCents: parcela.amountCents,
        costsCents: custo,
        expenseCents: 0,
      });
    });
  }

  for (const despesa of expenses) {
    if (!despesa.amountCents || despesa.amountCents <= 0) continue;
    raw.push({
      key: `despesa-${despesa.id}`,
      kind: "despesa",
      date: despesa.date,
      saleId: 0,
      paymentId: null,
      expenseId: despesa.id,
      receiptId: null,
      implicit: false,
      tier: null,
      baseCents: 0,
      costsCents: 0,
      expenseCents: despesa.amountCents,
    });
  }

  // Recebimentos que entram na divisão: comissão de fabricante e outras receitas, na data
  // em que o dinheiro entrou. Só os já recebidos. No modo "venda" a comissão já foi contada
  // na data da venda, então os recebimentos de comissão não entram de novo.
  for (const r of receipts) {
    if (r.status !== "recebida" || !r.receivedDate || r.amountCents <= 0) continue;
    if (r.kind === "aporte_socio") continue;
    if (r.kind === "comissao_fabricante" && settings.mode === "venda") continue;
    raw.push({
      key: `receita-${r.id}`,
      kind: "receita",
      date: r.receivedDate,
      saleId: 0,
      paymentId: null,
      expenseId: null,
      receiptId: r.id,
      implicit: false,
      tier: r.kind === "comissao_fabricante" ? "atacado" : null,
      baseCents: r.amountCents,
      costsCents: 0,
      expenseCents: 0,
    });
  }

  // Ordem do tempo: data, depois despesas (para descontarem do lucro do mesmo dia),
  // depois venda, parcela e receita. Sempre a mesma ordem.
  raw.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.kind === "despesa" ? 0 : 1) - (b.kind === "despesa" ? 0 : 1) ||
      a.saleId - b.saleId ||
      (a.paymentId ?? 0) - (b.paymentId ?? 0) ||
      (a.expenseId ?? 0) - (b.expenseId ?? 0) ||
      (a.receiptId ?? 0) - (b.receiptId ?? 0)
  );

  const pagamentosDoJoao = [...joaoPayments].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  const events: CascadeEvent[] = [];
  let abatidoAteAgora = 0;
  let acompensar = 0; // despesas e prejuízos ainda não cobertos por lucro

  for (const e of raw) {
    // Pagamento do João vale a partir da sua data, para não reescrever o passado.
    const pagoAteAgora = pagamentosDoJoao
      .filter((p) => p.date <= e.date)
      .reduce((soma, p) => soma + p.amountCents, 0);
    const dividaAntes = Math.max(0, debtTotal - pagoAteAgora - abatidoAteAgora);

    let reposicao = 0;
    let lucro = 0;
    let compensado = 0;
    let perdaLevada = 0;
    let distribuivel = 0;

    if (e.kind === "despesa") {
      acompensar += e.expenseCents;
    } else {
      // Comissões e outras receitas usam o percentual de reposição do atacado (0% por padrão).
      const percentual =
        e.kind === "receita" || e.tier === "atacado"
          ? settings.wholesalePct
          : e.tier === "consignado"
            ? settings.consignmentPct
            : settings.retailPct;
      reposicao = pctOf(e.baseCents, percentual);
      lucro = e.baseCents - reposicao - e.costsCents;

      if (lucro > 0) {
        compensado = Math.min(acompensar, lucro);
        acompensar -= compensado;
        distribuivel = lucro - compensado;
      } else if (lucro < 0) {
        perdaLevada = -lucro;
        acompensar += perdaLevada;
      }
    }

    const parteJoao = roundDiv(distribuivel * joaoBp, 10000);
    const parteFernanda = distribuivel - parteJoao; // assim a soma das partes sempre fecha
    const abatimento = Math.max(0, Math.min(parteJoao, dividaAntes));
    abatidoAteAgora += abatimento;

    events.push({
      key: e.key,
      kind: e.kind,
      tier: e.tier,
      date: e.date,
      saleId: e.saleId,
      paymentId: e.paymentId,
      expenseId: e.expenseId,
      receiptId: e.receiptId,
      implicit: e.implicit,
      baseCents: e.baseCents,
      replenishCents: reposicao,
      costsCents: e.costsCents,
      expenseCents: e.expenseCents,
      profitCents: lucro,
      compensatedCents: compensado,
      lossCarriedCents: perdaLevada,
      distributableCents: distribuivel,
      carryAfterCents: acompensar,
      joaoShareCents: parteJoao,
      fernandaShareCents: parteFernanda,
      debtBeforeCents: dividaAntes,
      abatementCents: abatimento,
      joaoReceivesCents: parteJoao - abatimento,
      fernandaReceivesCents: parteFernanda + abatimento,
      debtAfterCents: dividaAntes - abatimento,
    });
  }

  const soma = (campo: (e: CascadeEvent) => number, filtro: (e: CascadeEvent) => boolean = () => true) =>
    events.filter(filtro).reduce((total, e) => total + campo(e), 0);

  const totals = {
    soldCents,
    countedCents: soma(
      (e) => e.baseCents,
      (e) => e.kind !== "despesa" && e.kind !== "receita" && e.tier !== "atacado"
    ),
    pendingCents: 0,
    wholesaleCommissionCountedCents: soma((e) => e.baseCents, (e) => e.tier === "atacado"),
    otherIncomeCountedCents: soma((e) => e.baseCents, (e) => e.kind === "receita" && e.tier === null),
    replenishCents: soma((e) => e.replenishCents),
    costsCents: soma((e) => e.costsCents),
    expensesCents: soma((e) => e.expenseCents),
    profitCents: soma((e) => e.profitCents),
    compensatedCents: soma((e) => e.compensatedCents),
    carryCents: acompensar,
    distributableCents: soma((e) => e.distributableCents),
    abatedCents: soma((e) => e.abatementCents),
    joaoReceivesCents: soma((e) => e.joaoReceivesCents),
    fernandaReceivesCents: soma((e) => e.fernandaReceivesCents),
  };
  totals.pendingCents = soldCents - totals.countedCents;

  const paidDirectCents = pagamentosDoJoao.reduce((total, p) => total + p.amountCents, 0);
  const quitado = paidDirectCents + totals.abatedCents;
  const debt = {
    totalCents: debtTotal,
    paidDirectCents,
    abatedCents: totals.abatedCents,
    balanceCents: Math.max(0, debtTotal - quitado),
    excessPaidCents: Math.max(0, quitado - debtTotal),
    paidFraction: debtTotal === 0 ? 0 : Math.min(1, quitado / debtTotal),
  };

  if (semValor.length) {
    warnings.push({
      code: "venda_sem_valor",
      message: "Vendas sem valor não entram nas contas até o valor ser informado.",
      saleIds: semValor,
    });
  }
  if (semForma.length) {
    warnings.push({
      code: "pagamento_nao_informado",
      message:
        "Vendas sem forma de pagamento informada. Estamos contando como recebidas na data da venda.",
      saleIds: semForma,
    });
  }
  if (atacadoSemFabricante.length) {
    warnings.push({
      code: "atacado_sem_fabricante_representado",
      message:
        "Vendas de atacado sem fabricante representado. Ficam fora das contas até informar o fabricante e a comissão dele.",
      saleIds: atacadoSemFabricante,
    });
  }
  if (parcelasDiferentes.length) {
    warnings.push({
      code: "parcelas_diferem_da_venda",
      message: "A soma das parcelas é diferente do valor da venda.",
      saleIds: parcelasDiferentes,
    });
  }
  if (semDataDeRecebimento.length) {
    warnings.push({
      code: "recebida_sem_data",
      message: "Parcelas marcadas como recebidas sem a data do recebimento. Usamos a data prevista.",
      saleIds: semDataDeRecebimento,
    });
  }
  if (debt.excessPaidCents > 0) {
    warnings.push({
      code: "pagamento_alem_da_divida",
      message: "O João já pagou mais do que a dívida do estoque inicial.",
    });
  }

  return {
    events,
    totals,
    debt,
    check: {
      fernandaPlusJoaoEqualsDistributable:
        totals.fernandaReceivesCents + totals.joaoReceivesCents === totals.distributableCents,
    },
    warnings,
  };
}
