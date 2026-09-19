// Dinheiro sempre em CENTAVOS INTEIROS dentro das contas.
// Motivo: números decimais do JavaScript erram na conta (0,1 + 0,2 não dá 0,3).
// Só voltamos para reais na hora de mostrar na tela.

export type Cents = number;

/**
 * Converte um valor em reais para centavos, sem passar por decimal.
 * Aceita "398.46", "398,46", "82.5" e números. Vazio vira 0.
 */
export function toCents(value: string | number | null | undefined): Cents {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Valor em dinheiro inválido: ${value}`);
    return Math.round(value * 100);
  }

  const texto = value.trim().replace(",", ".");
  const partes = /^(-?)(\d+)(?:\.(\d*))?$/.exec(texto);
  if (!partes) throw new Error(`Valor em dinheiro inválido: "${value}"`);

  const sinal = partes[1] === "-" ? -1 : 1;
  const inteiro = parseInt(partes[2], 10);
  const decimais = partes[3] ?? "";
  const duasCasas = decimais.slice(0, 2).padEnd(2, "0");
  let centavos = inteiro * 100 + parseInt(duasCasas, 10);

  // Se vier mais de duas casas, arredonda a terceira (meio para cima).
  if (decimais.length > 2 && decimais[2] >= "5") centavos += 1;

  return sinal * centavos;
}

/** Divisão inteira arredondando meio para longe do zero (1,5 vira 2 e -1,5 vira -2). */
export function roundDiv(numerador: number, denominador: number): number {
  if (denominador <= 0) throw new Error("Denominador precisa ser maior que zero");
  const sinal = numerador < 0 ? -1 : 1;
  const absoluto = Math.abs(numerador);
  return sinal * Math.floor((2 * absoluto + denominador) / (2 * denominador));
}

/** Percentual (com até 2 casas, ex.: 30 ou 33,33) de um valor em centavos. */
export function pctOf(centavos: Cents, percentual: number): Cents {
  const pontosBase = Math.round(percentual * 100); // 30% vira 3000
  return roundDiv(centavos * pontosBase, 10000);
}

/** Centavos como número em reais (só para gravar no banco ou mostrar). */
export function centsToReais(centavos: Cents): number {
  return centavos / 100;
}

/** Centavos como texto com duas casas, ex.: 123456 vira "1234.56" (formato do banco). */
export function centsToDecimalString(centavos: Cents): string {
  const sinal = centavos < 0 ? "-" : "";
  const absoluto = Math.abs(centavos);
  const reais = Math.floor(absoluto / 100);
  const resto = String(absoluto % 100).padStart(2, "0");
  return `${sinal}${reais}.${resto}`;
}

/** Centavos como "R$ 1.234,56". */
export function formatCentsBRL(centavos: Cents): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}
