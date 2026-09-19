import { NextRequest, NextResponse } from "next/server";
import { decideAccess } from "./lib/auth/access";
import { SESSION_COOKIE } from "./lib/auth/session";

// O "porteiro": roda antes de QUALQUER página ou rota do radar.
// Sem login válido, só deixa passar a tela de entrada e o próprio login.

export async function middleware(req: NextRequest) {
  const decisao = await decideAccess({
    pathname: req.nextUrl.pathname,
    search: req.nextUrl.search,
    method: req.method,
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
    cookie: req.cookies.get(SESSION_COOKIE)?.value,
    secret: process.env.SESSION_SECRET,
  });

  const ehApi = req.nextUrl.pathname.startsWith("/api/");

  switch (decisao.action) {
    case "allow":
      return NextResponse.next();

    case "redirect-login": {
      const destino = new URL("/login", req.url);
      if (decisao.next && decisao.next !== "/") destino.searchParams.set("next", decisao.next);
      return NextResponse.redirect(destino);
    }

    case "unauthorized":
      return NextResponse.json({ error: "unauthorized", message: "Faça login para continuar." }, { status: 401 });

    case "forbidden":
      return NextResponse.json({ error: "forbidden", message: "Pedido recusado." }, { status: 403 });

    case "misconfigured":
      if (ehApi) {
        return NextResponse.json(
          { error: "auth_not_configured", message: "O login ainda não foi configurado." },
          { status: 503 }
        );
      }
      return new NextResponse(
        "O login do Radar de Vendas ainda não foi configurado. Avise o administrador do sistema.",
        { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
      );
  }
}

export const config = {
  // Tudo, menos os arquivos internos do Next (estilos, scripts), o ícone e as imagens da marca.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|marca/).*)"],
};
