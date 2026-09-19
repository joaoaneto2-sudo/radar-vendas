import { Cents, pctOf, roundDiv } from "./money";

// A "cascata" é a divisão de cada venda entre o fundo de reposição, a Fernanda
// e o João, e o abatimento da dívida do João pelo estoque inicial.
// Este arquivo não fala com o banco: recebe os dados e devolve as contas.
// Assim dá para testar com números conhecidos.

export type Tier = "varejo" | "atacado";
export type CascadeMode = "recebimento" | "venda";

export interface Settings {
  retailPct: number; // ex.: 30
  wholesalePct: number; // ex.: 0
  joaoSharePct: number; // ex.: 50 (participação do João e divisão do lucro)
  initialStockCents: Cents; // ex.: 1500000
  mode: CascadeMode; // "recebimento" conta quando o dinheiro entra
}

export interface PaymentInput {
  id: number;
  dueDate: string; // AAAA-MM-DD
  amountCents: Cents;
  status: "prevista" | "recebida";
  receivedDate: string | null;
}

export interface SaleInput {
  id: number;
  date: string; // AAAA-MM-DD
  amountCents: Cents;
  costsCents: Cents; // custos da venda, já somados com a taxa de cartão ou link
  tier: Tier;
  status: "ativa" | "cancelada";
  paymentMethod?: string | null;
  label?: string | null; // nome do cliente, só para mostrar na tela
  payments: PaymentInput[];
}

export interface JoaoPaymentInput {
  id: number;
  date: string;
  amountCents: Cents;
}

export interface CascadeEvent {
  key: string; // "venda-12" ou "parcela-34"
  date: string;
  saleId: number;
  paymentId: number | null;
  implicit: boolean; // true: não há parcela cadastrada, contamos como recebido na data da venda
  baseCents: Cents;
  replenishCents: Cents;
  costsCents: Cents;
  profitCents: Cents;
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
    soldCents: Cents; // total das vendas ativas
    countedCents: Cents; // parte que entrou na cascata
    pendingCents: Cents; // vendido que ainda não entrou (só no modo "recebimento")
    replenishCents: Cents;
    costsCents: Cents;
    profitCents: Cents;
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
  check: { fernandaPlusJoaoEqualsProfit: boolean };
  warnings: Warning[];
}

interface RawEvent {
  key: string;
  date: string;
  saleId: number;
  paymentId: number | null;
  implicit: boolean;
  baseCents: Cents;
  costsCents: Cents;
  tier: Tier;
}

export function computeCascade(
  settings: Settings,
  sales: SaleInput[],
  joaoPayments: JoaoPaymentInput[]
): CascadeResult {
  const warnings: Warning[] = [];
  const joaoBp = Math.round(settings.joaoSharePct * 100);
  const debtTotal = pctOf(settings.initialStockCents, settings.joaoSharePct);

  const semValor: number[] = [];
  const semForma: number[] = [];
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
    soldCents += sale.amountCents;

    const semParcelas = sale.payments.length === 0;
    if (semParcelas && (!sale.paymentMethod || sale.paymentMethod === "Não informada")) {
      semForma.push(sale.id);
    }

    if (settings.mode === "venda") {
      raw.push({
        key: `venda-${sale.id}`,
        date: sale.date,
        saleId: sale.id,
        paymentId: null,
        implicit: false,
        baseCents: sale.amountCents,
        costsCents: sale.costsCents,
        tier: sale.tier,
      });
      continue;
    }

    // Modo "recebimento".
    if (semParcelas) {
      // Sem parcelas cadastradas: contamos como recebido na data da venda.
      raw.push({
        key: `venda-${sale.id}`,
        date: sale.date,
        saleId: sale.id,
        paymentId: null,
        implicit: true,
        baseCents: sale.amountCents,
        costsCents: sale.costsCents,
        tier: sale.tier,
      });
      continue;
    }

    const parcelas = [...sale.payments].sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id
    );
    const totalParcelas = parcelas.reduce((soma, p) => soma + p.amountCents, 0);
    if (totalParcelas !== sale.amountCents) parcelasDiferentes.push(sale.id);

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
        date: parcela.receivedDate ?? parcela.dueDate,
        saleId: sale.id,
        paymentId: parcela.id,
        implicit: false,
        baseCents: parcela.amountCents,
        costsCents: custo,
        tier: sale.tier,
      });
    });
  }

  // Ordem do tempo: data, depois venda, depois parcela. Sempre a mesma ordem.
  raw.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.saleId - b.saleId || (a.paymentId ?? 0) - (b.paymentId ?? 0)
  );

  const pagamentosDoJoao = [...joaoPayments].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  const events: CascadeEvent[] = [];
  let abatidoAteAgora = 0;

  for (const e of raw) {
    // Pagamento do João vale a partir da sua data, para não reescrever o passado.
    const pagoAteAgora = pagamentosDoJoao
      .filter((p) => p.date <= e.date)
      .reduce((soma, p) => soma + p.amountCents, 0);
    const dividaAntes = Math.max(0, debtTotal - pagoAteAgora - abatidoAteAgora);

    const percentual = e.tier === "atacado" ? settings.wholesalePct : settings.retailPct;
    const reposicao = pctOf(e.baseCents, percentual);
    const lucro = e.baseCents - reposicao - e.costsCents;
    const parteJoao = roundDiv(lucro * joaoBp, 10000);
    const parteFernanda = lucro - parteJoao; // assim a soma das partes sempre fecha no lucro
    const abatimento = Math.max(0, Math.min(parteJoao, dividaAntes));

    abatidoAteAgora += abatimento;

    events.push({
      key: e.key,
      date: e.date,
      saleId: e.saleId,
      paymentId: e.paymentId,
      implicit: e.implicit,
      baseCents: e.baseCents,
      replenishCents: reposicao,
      costsCents: e.costsCents,
      profitCents: lucro,
      joaoShareCents: parteJoao,
      fernandaShareCents: parteFernanda,
      debtBeforeCents: dividaAntes,
      abatementCents: abatimento,
      joaoReceivesCents: parteJoao - abatimento,
      fernandaReceivesCents: parteFernanda + abatimento,
      debtAfterCents: dividaAntes - abatimento,
    });
  }

  const soma = (campo: (e: CascadeEvent) => number) =>
    events.reduce((total, e) => total + campo(e), 0);

  const totals = {
    soldCents,
    countedCents: soma((e) => e.baseCents),
    pendingCents: 0,
    replenishCents: soma((e) => e.replenishCents),
    costsCents: soma((e) => e.costsCents),
    profitCents: soma((e) => e.profitCents),
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
      fernandaPlusJoaoEqualsProfit:
        totals.fernandaReceivesCents + totals.joaoReceivesCents === totals.profitCents,
    },
    warnings,
  };
}
