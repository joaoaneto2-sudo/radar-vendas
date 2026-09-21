import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import type { Quem } from "@/lib/audit";

/** Quem está logado nesta chamada do site (para as rotas de edição e exclusão). */
export async function quemFez(): Promise<Quem> {
  const sessao = await verifySession(cookies().get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
  return { id: sessao?.uid ?? null, name: sessao?.name ?? null };
}
