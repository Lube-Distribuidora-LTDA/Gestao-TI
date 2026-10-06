import { NextResponse, type NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import { verificarSessao, COOKIE_SESSAO } from "@/lib/auth";
import { sentinela } from "@/lib/sentinela-guarda";

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

/**
 * Sentinela Lube: o Gestão TI só abre com login do Painel Lube.
 * Vale quando a lista da central não vem (partida a frio, central fora); com lista, manda o banco
 * (sentinela.sistemas.exige_login e rotas_publicas). As rotas abaixo ficam abertas para quem NÃO
 * tem conta no Painel: abrir e acompanhar chamado (telas e a API que elas usam) e o robô da Vercel
 * (/api/cron/, que já exige CRON_SECRET). /login e o painel NÃO entram aqui.
 */
const FECHADO = {
  projeto: "gestao-ti",
  slug: "gestao-ti",
  rotas: ["/abrir-chamado", "/acompanhar", "/api/chamados/publico", "/api/cron/"],
};

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  // Sentinela primeiro. A sessão do próprio app (cookie gti_sessao) vira a identidade do evento.
  const sessao = await verificarSessao(req.cookies.get(COOKIE_SESSAO)?.value);
  const identidade = sessao?.email ? { email: sessao.email, origem: "sessao_app" as const } : undefined;
  const barrado = await sentinela(req, event, { fechado: FECHADO, identidade });
  if (barrado) return barrado;

  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

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
