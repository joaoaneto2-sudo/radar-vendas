import { formatCentsBRL, type Cents } from "./finance/money";
import { valorVendido, type VendaLinha } from "./dashboard";
import { mesDe, nomeDoMes } from "./meta-mensal";
import { metaDosCartoes } from "./meta-cartoes";

// Dados da arte que vai junto com o relatório do dia no grupo (função pura, sem banco).

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const reaisArte = (c: Cents) => formatCentsBRL(c).replace(/ /g, " ");
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export interface LinhaDoCartaoNaArte {
  nome: string;
  vence: string; // "13/11"
  total: string;
  parte: string; // "10%"
  guardado: string;
  fracao: number; // 0 a 1, para a barra
  previsao: string; // "sobram R$ ..." ou "faltam R$ ..."
  previsaoOk: boolean;
}

export interface PassoNaArte {
  vence: string;
  nome: string;
  paga: string;
  fica: string;
  ok: boolean;
}

export interface DadosDaArte {
  titulo: string; // "quarta, 11/11"
  hojeValor: string;
  hojeVendas: number;
  mesNome: string;
  mesValor: string;
  mesVendas: number;
  media: string;
  diasComVenda: number;
  cartoes: LinhaDoCartaoNaArte[];
  projecao: PassoNaArte[];
}

export function dadosDaArte(vendas: VendaLinha[], dia: string): DadosDaArte {
  const ativa = (v: VendaLinha) => v.status !== "cancelada" && v.price_tier !== "atacado";
  const doDia = vendas.filter((v) => ativa(v) && String(v.sale_date).slice(0, 10) === dia);
  const mes = mesDe(dia);
  const doMes = vendas.filter((v) => ativa(v) && mesDe(String(v.sale_date)) === mes && String(v.sale_date).slice(0, 10) <= dia);
  const m = metaDosCartoes(vendas, dia);
  const nome = nomeDoMes(mes);

  return {
    titulo: `${DIAS[new Date(`${dia}T12:00:00Z`).getUTCDay()]}, ${dataBR(dia)}`,
    hojeValor: reaisArte(doDia.reduce((t, v) => t + valorVendido(v), 0)),
    hojeVendas: doDia.length,
    mesNome: nome.charAt(0).toUpperCase() + nome.slice(1),
    mesValor: reaisArte(doMes.reduce((t, v) => t + valorVendido(v), 0)),
    mesVendas: doMes.length,
    media: reaisArte(m.mediaPorDiaCents),
    diasComVenda: m.diasTrabalhados,
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
    projecao: m.projecaoDoCaixa.map((p) => ({
      vence: dataBR(p.vence),
      nome: p.nome,
      paga: reaisArte(p.totalCents),
      fica: p.depoisDePagarCents >= 0 ? reaisArte(p.depoisDePagarCents) : `faltam ${reaisArte(-p.depoisDePagarCents)}`,
      ok: p.depoisDePagarCents >= 0,
    })),
  };
}
