import type { FundResult } from "./finance/accounts";
import type { FundAccount } from "./finance/cascade";
import type { Fundo } from "./finance/funds";
import { formatarPct } from "./finance/funds";
import { formatCentsBRL } from "./finance/money";

// A faixa de fundos no alto do Painel financeiro: um cartão para o fundo de reposição
// e um para cada fundo ativo, com o texto já pronto para mostrar.

export interface CartaoDeFundo {
  chave: string;
  titulo: string;
  acumulado: string; // tudo o que já entrou no fundo
  gasto: string;
  saldo: string;
  saldoNegativo: boolean;
  pct: string;
  href: string;
}

export function cartoesDosFundos(entrada: {
  reposicao: FundResult;
  retailPct: number;
  fundos: Fundo[];
  contas: FundAccount[];
}): CartaoDeFundo[] {
  const cartoes: CartaoDeFundo[] = [
    {
      chave: "reposicao",
      titulo: "Fundo de reposição",
      acumulado: formatCentsBRL(entrada.reposicao.enteredCents),
      gasto: formatCentsBRL(entrada.reposicao.paidCents),
      saldo: formatCentsBRL(entrada.reposicao.balanceCents),
      saldoNegativo: entrada.reposicao.balanceCents < 0,
      pct: `${formatarPct(entrada.retailPct)}% do varejo`,
      href: "/financeiro/fundo",
    },
  ];
  const contas = new Map(entrada.contas.map((c) => [c.fundId, c]));
  for (const f of entrada.fundos) {
    if (!f.active) continue;
    const c = contas.get(f.id);
    cartoes.push({
      chave: `fundo-${f.id}`,
      titulo: f.name,
      acumulado: formatCentsBRL(c?.enteredCents ?? 0),
      gasto: formatCentsBRL(c?.spentCents ?? 0),
      saldo: formatCentsBRL(c?.balanceCents ?? 0),
      saldoNegativo: (c?.balanceCents ?? 0) < 0,
      pct: `${formatarPct(c?.pctThisMonth ?? 0)}% este mês`,
      href: "/financeiro/fundos",
    });
  }
  return cartoes;
}
