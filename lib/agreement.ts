import { Cents, centsToDecimalString, formatCentsBRL, pctOf, toCents } from "./finance/money";
import { readMoneyOrNull } from "./store-rules";

// Parâmetros do acordo entre João e Fernanda: as regras (sem banco) para conferir e comparar uma mudança.
// Os números daqui mandam em TODAS as contas (lucro, dívida, divisão), então cada mudança é conferida,
// registrada no histórico e pode ser desfeita.

export interface AcordoValores {
  partnershipStart: string; // AAAA-MM-DD
  retailPct: number; // reposição do varejo, ex.: 30
  wholesalePct: number; // reposição sobre a comissão do atacado, ex.: 0
  consignmentPct: number; // reposição do consignado, ex.: 30
  joaoSharePct: number; // parte do João no lucro e na dívida, ex.: 50
  initialStockCents: Cents; // valor do estoque inicial
}

export type CampoDoAcordo = keyof AcordoValores;

export const CAMPOS_DO_ACORDO: CampoDoAcordo[] = [
  "partnershipStart",
  "retailPct",
  "consignmentPct",
  "wholesalePct",
  "joaoSharePct",
  "initialStockCents",
];

export const ROTULOS: Record<CampoDoAcordo, string> = {
  partnershipStart: "Início da sociedade",
  retailPct: "Reposição do varejo",
  consignmentPct: "Reposição do consignado",
  wholesalePct: "Reposição do atacado",
  joaoSharePct: "Parte do João",
  initialStockCents: "Estoque inicial",
};

// Nome de cada campo no corpo do pedido (o mesmo das colunas do banco).
export const CHAVES_DO_PEDIDO: Record<CampoDoAcordo, string> = {
  partnershipStart: "partnership_start",
  retailPct: "retail_replenish_pct",
  consignmentPct: "consignment_replenish_pct",
  wholesalePct: "wholesale_replenish_pct",
  joaoSharePct: "joao_share_pct",
  initialStockCents: "initial_stock_value",
};

export interface Mudanca {
  campo: CampoDoAcordo;
  antes: number | string; // porcentagem, centavos ou data
  depois: number | string;
}

export type ResultadoDoAcordo =
  | { ok: true; valores: AcordoValores; mudancas: Mudanca[] }
  | { ok: false; error: string; message: string };

const erro = (error: string, message: string) => ({ ok: false as const, error, message });
const tem = (obj: Record<string, unknown>, chave: string) => Object.prototype.hasOwnProperty.call(obj, chave) && obj[chave] !== undefined;

function dataValida(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Junta o que veio da tela com os valores de hoje e confere. Só olha as chaves que vieram (as outras ficam como estão).
 * Devolve os valores novos e a lista do que realmente mudou. Sem nenhuma mudança, recusa.
 */
export function validarAcordo(entrada: Record<string, unknown>, atual: AcordoValores): ResultadoDoAcordo {
  const novos: AcordoValores = { ...atual };

  for (const campo of ["retailPct", "consignmentPct", "wholesalePct", "joaoSharePct"] as const) {
    const chave = CHAVES_DO_PEDIDO[campo];
    if (!tem(entrada, chave)) continue;
    const v = readMoneyOrNull(entrada[chave]);
    if (v === null) return erro("missing_value", `Informe a porcentagem de "${ROTULOS[campo]}".`);
    if (v === "invalido") return erro("invalid_value", `A porcentagem de "${ROTULOS[campo]}" não é um número válido.`);
    if (v < 0 || v > 100) return erro("out_of_range", `A porcentagem de "${ROTULOS[campo]}" precisa ficar entre 0 e 100.`);
    novos[campo] = Math.round(v * 100) / 100; // o banco guarda duas casas
  }

  if (tem(entrada, CHAVES_DO_PEDIDO.initialStockCents)) {
    const v = readMoneyOrNull(entrada[CHAVES_DO_PEDIDO.initialStockCents]);
    if (v === null) return erro("missing_value", "Informe o valor do estoque inicial.");
    if (v === "invalido") return erro("invalid_value", "O valor do estoque inicial não é um número válido.");
    if (v < 0) return erro("negative_value", "O estoque inicial não pode ser negativo.");
    novos.initialStockCents = toCents(v);
  }

  if (tem(entrada, CHAVES_DO_PEDIDO.partnershipStart)) {
    const v = entrada[CHAVES_DO_PEDIDO.partnershipStart];
    if (!dataValida(v)) return erro("invalid_date", "O início da sociedade precisa ser uma data válida.");
    novos.partnershipStart = v;
  }

  const mudancas: Mudanca[] = [];
  for (const campo of CAMPOS_DO_ACORDO) {
    if (novos[campo] !== atual[campo]) mudancas.push({ campo, antes: atual[campo], depois: novos[campo] });
  }
  if (mudancas.length === 0) return erro("no_changes", "Nada foi alterado.");
  return { ok: true, valores: novos, mudancas };
}

/** Dívida do João com a Fernanda: a parte dele do estoque inicial. */
export function dividaDoJoao(initialStockCents: Cents, joaoSharePct: number): Cents {
  return pctOf(initialStockCents, joaoSharePct);
}

function pct(v: number): string {
  return `${String(v).replace(".", ",")}%`;
}

export function formatarValor(campo: CampoDoAcordo, valor: number | string): string {
  if (campo === "initialStockCents") return formatCentsBRL(Number(valor));
  if (campo === "partnershipStart") {
    const [a, m, d] = String(valor).split("-");
    return `${d}/${m}/${a}`;
  }
  return pct(Number(valor));
}

export function textoDaMudanca(m: Mudanca): string {
  return `${ROTULOS[m.campo]}: ${formatarValor(m.campo, m.antes)} para ${formatarValor(m.campo, m.depois)}`;
}

/**
 * Só dá para desfazer uma mudança se os valores de hoje ainda são os que ela deixou
 * (senão desfazer apagaria uma mudança mais nova que ela).
 */
export function podeDesfazer(atual: AcordoValores, mudancas: Mudanca[]): boolean {
  return mudancas.length > 0 && mudancas.every((m) => atual[m.campo] === m.depois);
}

/** Valor em texto com duas casas para gravar no banco. */
export function centavosParaBanco(c: Cents): string {
  return centsToDecimalString(c);
}
