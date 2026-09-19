import { NextRequest, NextResponse } from "next/server";
import {
  newSessionPayload,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSession,
} from "./session";

// Pequenas ajudas usadas pelas rotas de login.

export function clientIp(req: NextRequest): string {
  const encaminhado = req.headers.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "desconhecido";
}

export async function withSessionCookie(
  resposta: NextResponse,
  usuario: { id: number; name: string }
): Promise<NextResponse> {
  const segredo = process.env.SESSION_SECRET as string;
  const valor = await signSession(newSessionPayload(usuario), segredo);
  resposta.cookies.set({
    name: SESSION_COOKIE,
    value: valor,
    httpOnly: true, // o JavaScript da página não consegue ler o cookie
    secure: process.env.NODE_ENV === "production", // em produção, só viaja por https
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return resposta;
}

export function withoutSessionCookie(resposta: NextResponse): NextResponse {
  resposta.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return resposta;
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const dados = await req.json();
    return dados && typeof dados === "object" ? (dados as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const texto = (valor: unknown): string => (typeof valor === "string" ? valor : "");
