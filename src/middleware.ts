import { NextResponse, type NextRequest } from "next/server";
import { verificarSessao, COOKIE_SESSAO } from "@/lib/auth";

/** Rotas que qualquer pessoa da empresa acessa sem login. */
const PUBLICAS = [
  "/login",
  "/setup",
  "/abrir-chamado",
  "/acompanhar",
  "/api/auth",
  "/api/setup",
  "/api/chamados/publico",
  "/api/cron",       // protegida por CRON_SECRET, não por sessão
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  const sessao = await verificarSessao(req.cookies.get(COOKIE_SESSAO)?.value);

  if (!sessao) {
    // chamadas de API recebem 401; páginas vão para o login
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ erro: "Sessão expirada ou inexistente." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("de", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
