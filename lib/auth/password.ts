import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

// A senha nunca é guardada. Guardamos só um "resumo" dela, feito com scrypt (um
// método feito para ser lento de propósito, para dificultar quem tentar adivinhar).
// Cada senha usa um "sal" aleatório, então duas senhas iguais geram resumos diferentes.

function scrypt(senha: string, sal: Buffer, tamanho: number, opcoes: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(senha, sal, tamanho, opcoes, (erro, chave) => (erro ? reject(erro) : resolve(chave)));
  });
}

const CUSTO_N = 16384;
const CUSTO_R = 8;
const CUSTO_P = 1;
const TAMANHO_CHAVE = 64;

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

export async function hashPassword(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const chave = (await scrypt(senha, sal, TAMANHO_CHAVE, { N: CUSTO_N, r: CUSTO_R, p: CUSTO_P })) as Buffer;
  return ["scrypt", CUSTO_N, CUSTO_R, CUSTO_P, sal.toString("base64"), chave.toString("base64")].join("$");
}

export async function verifyPassword(senha: string, guardado: string): Promise<boolean> {
  const partes = guardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;

  const n = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  try {
    const sal = Buffer.from(partes[4], "base64");
    const esperado = Buffer.from(partes[5], "base64");
    const obtido = (await scrypt(senha, sal, esperado.length, { N: n, r, p })) as Buffer;
    return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
  } catch {
    return false;
  }
}

let resumoDeMentira: Promise<string> | null = null;

/**
 * Usado quando o e-mail não existe: fazemos a mesma conta cara de qualquer jeito,
 * para não dar para descobrir quais e-mails existem pelo tempo de resposta.
 */
export function dummyHash(): Promise<string> {
  if (!resumoDeMentira) resumoDeMentira = hashPassword("senha-que-ninguem-usa-" + randomBytes(8).toString("hex"));
  return resumoDeMentira;
}

/** Devolve a mensagem do problema (em português) ou null se a senha serve. */
export function validatePassword(senha: string, email: string): string | null {
  if (senha.length < MIN_PASSWORD_LENGTH) {
    return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres. Uma frase curta funciona bem.`;
  }
  if (senha.length > MAX_PASSWORD_LENGTH) return "A senha está muito longa.";
  if (senha.trim().toLowerCase() === email.trim().toLowerCase()) {
    return "A senha não pode ser igual ao e-mail.";
  }
  if (/^(.)\1+$/.test(senha)) return "A senha não pode ser um caractere repetido.";
  return null;
}
