// Fundos do negócio: as regras que não falam com o banco.
// Cada fundo separa uma % de toda entrada que entra na divisão (como a reposição de 30%).
// A % vale por MÊS. Cada mudança que o João faz vira uma regra; no mês M vale a regra mais
// recente (por data de criação) entre as que cobrem M. Sem regra, a % é 0.

export type MesISO = string; // sempre "AAAA-MM-01"

export interface Fundo {
  id: number;
  name: string;
  active: boolean;
}

export interface FundRule {
  id: number;
  fundId: number;
  pct: number; // 0 a 100, até 2 casas
  fromMonth: MesISO;
  toMonth: MesISO | null; // nulo = sem fim
  createdAt: string; // ISO; decide qual regra vale quando duas cobrem o mesmo mês
}

export type OpcaoDeQuando = "so_este_mes" | "proximo_mes" | "sempre";
export const OPCOES_DE_QUANDO: OpcaoDeQuando[] = ["so_este_mes", "proximo_mes", "sempre"];

export type Resultado = { ok: true } | { ok: false; error: string; message: string };

const NOMES_DOS_MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function mesDe(dataISO: string): MesISO {
  return `${dataISO.slice(0, 7)}-01`;
}

export function mesSeguinte(mes: MesISO): MesISO {
  const [ano, m] = mes.split("-").map(Number);
  return m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, "0")}-01`;
}

export function nomeDoMes(mes: MesISO): string {
  const [ano, m] = mes.split("-").map(Number);
  return `${NOMES_DOS_MESES[m - 1]} de ${ano}`;
}

/** "09/2026", para mensagens curtas. */
function mesCurto(mes: MesISO): string {
  return `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
}

export function formatarPct(n: number): string {
  return String(n).replace(".", ",");
}

/** A % de um fundo num mês: a regra mais recente entre as que cobrem o mês. Sem regra, 0. */
export function pctDoFundo(regras: FundRule[], fundId: number, mes: MesISO): number {
  let vencedora: FundRule | null = null;
  for (const r of regras) {
    if (r.fundId !== fundId || r.fromMonth > mes || (r.toMonth !== null && r.toMonth < mes)) continue;
    if (!vencedora || r.createdAt > vencedora.createdAt || (r.createdAt === vencedora.createdAt && r.id > vencedora.id)) {
      vencedora = r;
    }
  }
  return vencedora ? vencedora.pct : 0;
}

/** De qual mês até qual mês vale uma regra, para cada opção da tela. */
export function periodoDaOpcao(opcao: OpcaoDeQuando, hojeISO: string): { fromMonth: MesISO; toMonth: MesISO | null } {
  const atual = mesDe(hojeISO);
  if (opcao === "so_este_mes") return { fromMonth: atual, toMonth: atual };
  if (opcao === "proximo_mes") return { fromMonth: mesSeguinte(atual), toMonth: null };
  return { fromMonth: atual, toMonth: null };
}

export function descreverOpcao(opcao: OpcaoDeQuando, hojeISO: string): string {
  const atual = mesDe(hojeISO);
  if (opcao === "so_este_mes") return `Só em ${nomeDoMes(atual)}`;
  if (opcao === "proximo_mes") return `A partir de ${nomeDoMes(mesSeguinte(atual))}`;
  return `Por tempo indeterminado, a partir de ${nomeDoMes(atual)}`;
}

export function descreverPeriodo(fromMonth: MesISO, toMonth: MesISO | null): string {
  if (toMonth === null) return `a partir de ${nomeDoMes(fromMonth)}, sem fim`;
  if (toMonth === fromMonth) return `só em ${nomeDoMes(fromMonth)}`;
  return `de ${nomeDoMes(fromMonth)} até ${nomeDoMes(toMonth)}`;
}

const emPontos = (pct: number) => Math.round(pct * 100); // 5,25% vira 525 (evita erro de decimal)

/**
 * Confere uma regra nova: % de 0 a 100 com até 2 casas, e, em todo mês que ela muda,
 * a soma das % de todos os fundos mais a maior reposição não pode passar de 100%.
 */
export function validarRegra(
  regras: FundRule[],
  nova: { fundId: number; pct: number; fromMonth: MesISO; toMonth: MesISO | null },
  todosOsFundIds: number[],
  reposicaoMaximaPct: number
): Resultado {
  const { pct } = nova;
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 100 || emPontos(pct) / 100 !== pct) {
    return { ok: false, error: "invalid_pct", message: "A porcentagem precisa ficar entre 0 e 100, com até duas casas." };
  }

  const hipotetica: FundRule = {
    id: Number.MAX_SAFE_INTEGER,
    fundId: nova.fundId,
    pct,
    fromMonth: nova.fromMonth,
    toMonth: nova.toMonth,
    createdAt: "9999-12-31T00:00:00.000Z",
  };
  const todas = [...regras, hipotetica];

  // Os únicos meses em que a soma pode mudar são os que começam ou terminam alguma regra.
  const candidatos = new Set<MesISO>([nova.fromMonth]);
  for (const r of todas) {
    candidatos.add(r.fromMonth);
    if (r.toMonth !== null) candidatos.add(mesSeguinte(r.toMonth));
  }
  const meses = [...candidatos]
    .filter((m) => m >= nova.fromMonth && (nova.toMonth === null || m <= nova.toMonth))
    .sort();

  for (const mes of meses) {
    const soma = todosOsFundIds.reduce((total, id) => total + emPontos(pctDoFundo(todas, id, mes)), 0);
    if (soma + emPontos(reposicaoMaximaPct) > 10000) {
      return {
        ok: false,
        error: "over_100",
        message: `A soma dos fundos (${formatarPct(soma / 100)}%) mais a reposição (${formatarPct(reposicaoMaximaPct)}%) passa de 100% em ${mesCurto(mes)}.`,
      };
    }
  }
  return { ok: true };
}

/** Só dá para arquivar um fundo com % zero (agora e nos meses futuros com regra) e saldo zero. */
export function podeArquivar(regras: FundRule[], fundId: number, hojeISO: string, saldoCents: number): Resultado {
  const hoje = mesDe(hojeISO);
  const doFundo = regras.filter((r) => r.fundId === fundId);
  const meses = new Set<MesISO>([hoje]);
  for (const r of doFundo) {
    if (r.fromMonth >= hoje) meses.add(r.fromMonth);
    if (r.toMonth !== null && mesSeguinte(r.toMonth) >= hoje) meses.add(mesSeguinte(r.toMonth));
  }
  if ([...meses].some((m) => pctDoFundo(regras, fundId, m) > 0)) {
    return { ok: false, error: "has_pct", message: "Zere a porcentagem deste fundo (neste mês e nos próximos) antes de arquivar." };
  }
  if (saldoCents !== 0) {
    return { ok: false, error: "has_balance", message: "Use ou zere o saldo deste fundo antes de arquivar." };
  }
  return { ok: true };
}

export function validarNomeDoFundo(
  nome: unknown,
  descricao: unknown
): { ok: true; nome: string; descricao: string | null } | { ok: false; error: string; message: string } {
  const n = typeof nome === "string" ? nome.trim() : "";
  if (n === "") return { ok: false, error: "missing_name", message: "Escreva o nome do fundo." };
  if (n.length > 40) return { ok: false, error: "name_too_long", message: "O nome do fundo pode ter até 40 letras." };
  const d = typeof descricao === "string" ? descricao.trim() : "";
  if (d.length > 200) return { ok: false, error: "description_too_long", message: "A descrição pode ter até 200 letras." };
  return { ok: true, nome: n, descricao: d === "" ? null : d };
}
