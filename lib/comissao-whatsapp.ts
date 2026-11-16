import { toCents, type Cents } from "./finance/money";

// Comissões que a Fernanda paga às funcionárias do salão e posta no grupo, por exemplo:
//   "Comissão de hoje 40 + 15 + 7=62"
//   "Paguei até hoje : 200+78+80=358" (seguida de "Paguei até hoje de comissão para os funcionários.")
// Regra (João, 16/11/2026): subtrair diariamente os valores pagos de comissão.
// O total é o número depois do último "="; sem "=", a soma das parcelas "a + b + c"; sem "+", o único número.

export const CATEGORIA_COMISSAO = "comissao_funcionarias";
export const DESCRICAO_COMISSAO = "Comissão das funcionárias (grupo)";

export type ComissaoLida =
  | { ok: true; totalCents: Cents; partesCents: Cents[]; conferiu: boolean }
  | { ok: false; motivo: string };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** A mensagem fala de comissão paga? ("comissão" ou "paguei até hoje", com algum número). */
export function pareceComissao(texto: string): boolean {
  const t = semAcento(texto).toLowerCase();
  if (/venda realizada/.test(t)) return false;
  return (/comiss/.test(t) || /paguei ate hoje/.test(t)) && /\d/.test(t);
}

const numero = (s: string): Cents | null => {
  const limpo = s.trim().replace(/^r\$\s*/i, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  const c = toCents(limpo);
  return c > 0 ? c : null;
};

export function lerComissao(texto: string): ComissaoLida {
  if (!pareceComissao(texto)) return { ok: false, motivo: "não é mensagem de comissão" };
  const t = texto.replace(/\s+/g, " ");
  // A conta: o trecho com números ligados por "+" (e talvez "= total").
  const conta = t.match(/(r\$\s*)?\d[\d.,]*(\s*\+\s*(r\$\s*)?\d[\d.,]*)*(\s*=\s*(r\$\s*)?\d[\d.,]*)?/i);
  if (!conta) return { ok: false, motivo: "sem valor" };
  const [esquerda, direita] = conta[0].split("=");
  const partes = esquerda.split("+").map(numero);
  if (partes.some((p) => p === null)) return { ok: false, motivo: "valor não entendido" };
  const partesCents = partes as Cents[];
  const soma = partesCents.reduce((a, b) => a + b, 0);
  let totalCents = soma;
  let conferiu = true;
  if (direita !== undefined) {
    const total = numero(direita);
    if (total === null) return { ok: false, motivo: "total não entendido" };
    totalCents = total;
    conferiu = partesCents.length < 2 || total === soma;
  }
  if (totalCents <= 0 || totalCents > toCents("5000")) return { ok: false, motivo: "valor fora do esperado" };
  return { ok: true, totalCents, partesCents, conferiu };
}
