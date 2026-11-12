import { formatCentsBRL, type Cents } from "./finance/money";
import { addDaysISO } from "./finance/dates";
import { valorVendido, type VendaLinha } from "./dashboard";
import { mesDe, nomeDoMes } from "./meta-mensal";
import { metaDosCartoes } from "./meta-cartoes";

// Dados da arte que vai junto com o relatório do dia no grupo (função pura, sem banco).

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const reaisArte = (c: Cents) => formatCentsBRL(c).replace(/ /g, " ");
/** "R$ 5.664" sem centavos, para títulos e rótulos de gráfico. */
export const reaisCurtos = (c: Cents) => reaisArte(Math.round(c / 100) * 100).replace(/,00$/, "");
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export interface BarraDoDia {
  dia: number;
  cents: Cents;
  folga: boolean; // domingo ou segunda
}

export interface LinhaDoCartaoNaArte {
  nome: string;
  vence: string;
  total: string;
  parte: string;
  guardado: string;
  fracao: number;
  previsao: string;
  previsaoOk: boolean;
}

export interface PontoDoCaixa {
  rotulo: string; // "hoje", "13/11"
  noVencimentoCents: Cents; // caixa às 20h, antes de pagar
  depoisCents: Cents | null; // depois de pagar (null em "hoje")
  paga: string | null; // "Riachuelo R$ 2.290,68"
}

export interface DadosDaArte {
  titulo: string;
  hojeValor: string;
  hojeVendas: number;
  mesNome: string;
  mesValor: string;
  mesVendas: number;
  media: string;
  diasComVenda: number;
  porDia: BarraDoDia[];
  cartoes: LinhaDoCartaoNaArte[];
  caixa: PontoDoCaixa[];
}

export function dadosDaArte(vendas: VendaLinha[], dia: string): DadosDaArte {
  const ativa = (v: VendaLinha) => v.status !== "cancelada" && v.price_tier !== "atacado";
  const data = (v: VendaLinha) => String(v.sale_date).slice(0, 10);
  const doDia = vendas.filter((v) => ativa(v) && data(v) === dia);
  const mes = mesDe(dia);
  const doMes = vendas.filter((v) => ativa(v) && mesDe(data(v)) === mes && data(v) <= dia);
  const m = metaDosCartoes(vendas, dia);
  const nome = nomeDoMes(mes);

  const porDia: BarraDoDia[] = [];
  for (let d = `${mes}-01`; d <= dia; d = addDaysISO(d, 1)) {
    const semana = new Date(`${d}T12:00:00Z`).getUTCDay();
    porDia.push({
      dia: Number(d.slice(8, 10)),
      cents: doMes.filter((v) => data(v) === d).reduce((t, v) => t + valorVendido(v), 0),
      folga: semana === 0 || semana === 1,
    });
  }

  const caixa: PontoDoCaixa[] = [];
  if (m.projecaoDoCaixa.length > 0) {
    const p0 = m.projecaoDoCaixa[0];
    caixa.push({ rotulo: "hoje", noVencimentoCents: p0.noVencimentoCents - p0.entraCents, depoisCents: null, paga: null });
    for (const p of m.projecaoDoCaixa) {
      caixa.push({ rotulo: dataBR(p.vence), noVencimentoCents: p.noVencimentoCents, depoisCents: p.depoisDePagarCents, paga: `${p.nome} ${reaisArte(p.totalCents)}` });
    }
  }

  return {
    titulo: `${DIAS[new Date(`${dia}T12:00:00Z`).getUTCDay()]}, ${dataBR(dia)}`,
    hojeValor: reaisArte(doDia.reduce((t, v) => t + valorVendido(v), 0)),
    hojeVendas: doDia.length,
    mesNome: nome.charAt(0).toUpperCase() + nome.slice(1),
    mesValor: reaisArte(doMes.reduce((t, v) => t + valorVendido(v), 0)),
    mesVendas: doMes.length,
    media: reaisArte(m.mediaPorDiaCents),
    diasComVenda: m.diasTrabalhados,
    porDia,
    cartoes: m.cartoes
      .filter((c) => !c.vencido)
      .map((c) => ({
        nome: c.nome,
        vence: dataBR(c.vence),
        total: reaisArte(c.totalCents),
        parte: `${Math.round(c.parte * 100)}%`,
        guardado: reaisArte(c.guardadoCents),
        fracao: c.totalCents > 0 ? Math.min(c.guardadoCents / c.totalCents, 1) : 1,
        previsao: c.previsaoSaldoCents >= 0 ? `sobram ${reaisArte(c.previsaoSaldoCents)}` : `faltam ${reaisArte(-c.previsaoSaldoCents)}`,
        previsaoOk: c.previsaoSaldoCents >= 0,
      })),
    caixa,
  };
}
