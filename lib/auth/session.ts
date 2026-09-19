// Sessão de login em um cookie ASSINADO.
// O cookie guarda quem é a pessoa e até quando vale, mais uma assinatura feita com
// a chave secreta do sistema (SESSION_SECRET). Sem a chave, ninguém consegue
// fabricar nem alterar um cookie. Usa só recursos que existem também no "porteiro"
// (middleware), por isso não importa nada de Node aqui.

export const SESSION_COOKIE = "radar_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias
export const MIN_SECRET_LENGTH = 32;

export interface SessionPayload {
  uid: number;
  name: string;
  iat: number; // emitido em (segundos)
  exp: number; // vale até (segundos)
}

const codificador = new TextEncoder();
const decodificador = new TextDecoder();

function paraBase64Url(bytes: Uint8Array): string {
  let binario = "";
  bytes.forEach((b) => (binario += String.fromCharCode(b)));
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): Uint8Array {
  const preenchimento = "=".repeat((4 - (texto.length % 4)) % 4);
  const binario = atob(texto.replace(/-/g, "+").replace(/_/g, "/") + preenchimento);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function chaveHmac(segredo: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    codificador.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** A chave secreta só serve se existir e for longa o bastante. */
export function isSecretUsable(segredo: string | undefined | null): segredo is string {
  return typeof segredo === "string" && segredo.length >= MIN_SECRET_LENGTH;
}

export function newSessionPayload(
  usuario: { id: number; name: string },
  agoraEmSegundos: number = Math.floor(Date.now() / 1000)
): SessionPayload {
  return {
    uid: usuario.id,
    name: usuario.name,
    iat: agoraEmSegundos,
    exp: agoraEmSegundos + SESSION_MAX_AGE_SECONDS,
  };
}

export async function signSession(payload: SessionPayload, segredo: string): Promise<string> {
  const corpo = paraBase64Url(codificador.encode(JSON.stringify(payload)));
  const assinatura = new Uint8Array(
    await crypto.subtle.sign("HMAC", await chaveHmac(segredo), codificador.encode(corpo))
  );
  return `${corpo}.${paraBase64Url(assinatura)}`;
}

/** Devolve os dados da sessão se o cookie for autêntico e não tiver vencido. Senão, null. */
export async function verifySession(
  token: string | undefined | null,
  segredo: string | undefined | null,
  agoraEmSegundos: number = Math.floor(Date.now() / 1000)
): Promise<SessionPayload | null> {
  if (!token || !isSecretUsable(segredo)) return null;

  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [corpo, assinaturaTexto] = partes;

  try {
    const valida = await crypto.subtle.verify(
      "HMAC",
      await chaveHmac(segredo),
      deBase64Url(assinaturaTexto),
      codificador.encode(corpo)
    );
    if (!valida) return null;

    const dados = JSON.parse(decodificador.decode(deBase64Url(corpo)));
    if (
      typeof dados.uid !== "number" ||
      typeof dados.name !== "string" ||
      typeof dados.iat !== "number" ||
      typeof dados.exp !== "number"
    ) {
      return null;
    }
    if (dados.exp <= agoraEmSegundos) return null;
    return dados as SessionPayload;
  } catch {
    return null;
  }
}
