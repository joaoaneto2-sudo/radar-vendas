import { toCents, type Cents } from "./finance/money";
import { valorVendido, type VendaLinha } from "./dashboard";
import { diasDeVendaAte, type Cartao, type ComissaoPaga } from "./meta-cartoes";

// Projeção pelo DINHEIRO QUE CAI NA CONTA (pedido do João em 17/11/2026).
// A meta dos cartões conta o valor vendido; mas quase tudo é crédito parcelado, que entra aos
// poucos, e a conta Santander da empresa estava negativa. Aqui o ponto de partida é o saldo real
// do banco, e só entra o que de fato vai cair na conta até cada vencimento:
//  - parcelas das vendas já feitas que vencem até lá (a maquininha deposita uma por mês);
//  - vendas novas à vista (Pix, débito, dinheiro), pela média de venda e pela parte à vista;
//    venda nova parcelada só cai a 1ª parcela 30 dias depois, então quase não ajuda no curto prazo;
//  - saem as comissões das funcionárias (pela proporção já paga) e as faturas no vencimento.
// Ainda sem a taxa da maquininha (o João vai passar): os valores são brutos.

export interface SaldoDoBanco {
  date: string; // AAAA-MM-DD do saldo informado
  cents: Cents; // negativo = usando o limite
  conta: string;
}

// Saldo informado pelo João em 17/11/2026: conta Santander da empresa em −R$ 2.400.
export const SALDO_DO_BANCO: SaldoDoBanco = { date: "2026-11-17", cents: toCents("-2400.00"), conta: "Santander" };

const FORMAS_A_VISTA = /^(pix à vista|pix a vista|débito|debito|dinheiro)$/i;

export interface ParcelaAReceber {
  due_date: string;
  amount: string | number;
}

export interface PassoDoDinheiro {
  nome: string;
  vence: string;
  totalCents: Cents;
  diasDeVenda: number; // do passo anterior até as 20h do vencimento
  parcelasCents: Cents; // parcelas de vendas já feitas que caem nesse intervalo
  vendasAVistaCents: Cents; // vendas novas à vista previstas pela média
  comissoesCents: Cents; // comissões previstas no intervalo
  noVencimentoCents: Cents; // saldo às 20h do vencimento, antes de pagar
  depoisDePagarCents: Cents;
  precisaAVistaPorDiaCents: Cents; // venda à vista por dia para pagar sem ficar negativo
}

export interface DinheiroNaConta {
  saldo: SaldoDoBanco;
  mediaPorDiaCents: Cents;
  parteAVista: number; // fração do vendido que foi à vista desde o início
  parteComissao: number; // comissão paga / vendido desde o início
  passos: PassoDoDinheiro[];
}

export function dinheiroNaConta(dados: {
  dia: string;
  saldo?: SaldoDoBanco;
  vendas: (VendaLinha & { payment_method?: string | null })[];
  parcelas: ParcelaAReceber[]; // parcelas previstas das vendas (status prevista)
  comissoes: ComissaoPaga[];
  cartoes: Cartao[];
  mediaPorDiaCents: Cents;
  inicio: string;
}): DinheiroNaConta {
  const saldo = dados.saldo ?? SALDO_DO_BANCO;
  const contam = dados.vendas.filter((v) => {
    const d = String(v.sale_date).slice(0, 10);
    return v.status !== "cancelada" && v.price_tier !== "atacado" && d >= dados.inicio && d <= dados.dia;
  });
  const vendido = contam.reduce((t, v) => t + valorVendido(v), 0);
  const aVista = contam.filter((v) => FORMAS_A_VISTA.test(String(v.payment_method ?? "").trim())).reduce((t, v) => t + valorVendido(v), 0);
  const comissoes = dados.comissoes.filter((c) => c.date >= dados.inicio && c.date <= dados.dia).reduce((t, c) => t + c.cents, 0);
  const parteAVista = vendido > 0 ? aVista / vendido : 0;
  const parteComissao = vendido > 0 ? comissoes / vendido : 0;

  // O saldo do banco já tem tudo até o dia dele. Depois disso: parcelas que vencem e vendas novas.
  const partida = dados.dia > saldo.date ? dados.dia : saldo.date;
  const parcelas = dados.parcelas.map((p) => ({ d: String(p.due_date).slice(0, 10), c: toCents(p.amount) }));
  // Vendas à vista feitas entre o dia do saldo e hoje (ainda não estavam no saldo informado).
  const aVistaDepoisDoSaldo = contam
    .filter((v) => String(v.sale_date).slice(0, 10) > saldo.date && FORMAS_A_VISTA.test(String(v.payment_method ?? "").trim()))
    .reduce((t, v) => t + valorVendido(v), 0);
  const comissoesDepoisDoSaldo = dados.comissoes.filter((c) => c.date > saldo.date && c.date <= dados.dia).reduce((t, c) => t + c.cents, 0);

  let caixa = saldo.cents + aVistaDepoisDoSaldo - comissoesDepoisDoSaldo;
  let desde = partida;
  const passos: PassoDoDinheiro[] = [];
  for (const c of [...dados.cartoes].sort((a, b) => a.vence.localeCompare(b.vence)).filter((x) => x.vence >= dados.dia)) {
    const dias = diasDeVendaAte(desde, c.vence);
    // Parcelas que caem depois do dia do saldo (1º intervalo) ou do vencimento anterior, até este.
    const de = passos.length ? desde : saldo.date;
    const parcelasCents = parcelas.filter((p) => p.d > de && p.d <= c.vence).reduce((t, p) => t + p.c, 0);
    const vendasAVistaCents = Math.round(dados.mediaPorDiaCents * dias * parteAVista);
    const comissoesCents = Math.round(dados.mediaPorDiaCents * dias * parteComissao);
    const antes = caixa + parcelasCents - comissoesCents; // sem as vendas novas à vista
    const noVencimentoCents = antes + vendasAVistaCents;
    const depoisDePagarCents = noVencimentoCents - c.totalCents;
    const falta = Math.max(0, c.totalCents - antes);
    passos.push({
      nome: c.nome,
      vence: c.vence,
      totalCents: c.totalCents,
      diasDeVenda: dias,
      parcelasCents,
      vendasAVistaCents,
      comissoesCents,
      noVencimentoCents,
      depoisDePagarCents,
      precisaAVistaPorDiaCents: dias > 0 ? Math.ceil(falta / dias) : falta,
    });
    caixa = depoisDePagarCents;
    desde = c.vence;
  }
  return { saldo, mediaPorDiaCents: dados.mediaPorDiaCents, parteAVista, parteComissao, passos };
}

/** Linhas do relatório do dia. */
export function secaoDoDinheiro(d: DinheiroNaConta, reais: (c: Cents) => string, dataBR: (s: string) => string): string[] {
  const l = [
    `🏦 *Dinheiro na conta ${d.saldo.conta}* (o que cai de verdade)`,
    `• Saldo informado em ${dataBR(d.saldo.date)}: ${reais(d.saldo.cents)}${d.saldo.cents < 0 ? " (limite do banco, cobra juros) 🔴" : ""}`,
    `• Das vendas desde 01/11, ${Math.round(d.parteAVista * 100)}% foram à vista (Pix, débito, dinheiro); o resto entra em parcelas, uma por mês.`,
  ];
  for (const p of d.passos) {
    l.push(
      `• Até ${dataBR(p.vence)}: entram ${reais(p.parcelasCents)} de parcelas já vendidas + ${reais(p.vendasAVistaCents)} de vendas à vista pela média, saem ${reais(p.comissoesCents)} de comissões → ${reais(p.noVencimentoCents)}; paga ${p.nome} ${reais(p.totalCents)} → ` +
        (p.depoisDePagarCents >= 0 ? `fica ${reais(p.depoisDePagarCents)} ✅` : `faltam ${reais(-p.depoisDePagarCents)} ⚠️`)
    );
    if (p.precisaAVistaPorDiaCents > 0) {
      l.push(`  Para pagar em dia: ${reais(p.precisaAVistaPorDiaCents)} por dia em venda À VISTA nos ${p.diasDeVenda} dias de venda`);
    }
  }
  l.push("_Venda parcelada feita agora só cai a 1ª parcela daqui a 30 dias. Valores sem a taxa da maquininha._");
  return l;
}

