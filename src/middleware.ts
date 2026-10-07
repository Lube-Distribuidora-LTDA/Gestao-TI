import { NextResponse, type NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import { verificarSessao, COOKIE_SESSAO } from "@/lib/auth";
import { sentinela } from "@/lib/sentinela-guarda";

/**
 * Rotas que o próprio app deixa passar sem o login dele (cookie gti_sessao). Não são públicas:
 * a Sentinela, logo abaixo, já exigiu o login do Painel Lube antes de chegar aqui.
 */
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
 * Sentinela Lube: o Gestão TI só abre com login do Painel Lube (decisão do Júlio, 2026-10-07).
 * Vale quando a lista da central não vem (partida a frio, central fora); com lista, manda o banco
 * (sentinela.sistemas.exige_login e rotas_publicas, hoje vazia). Nenhuma rota fica aberta: abrir
 * e acompanhar chamado também pedem login. O único robô aceito é o agendador da Vercel, que entra
 * pelo segredo conferido em agendadorDaVercel() (abaixo), e não por rota aberta.
 */
const FECHADO = {
  projeto: "gestao-ti",
  slug: "gestao-ti",
  rotas: [] as string[],
};

/** Identidade do agendador da Vercel nos eventos da Sentinela (sem "|" e sem e-mail de pessoa). */
const ROBO_AGENDADOR = { email: "robo do gestao ti (agendador da vercel)", origem: "sessao_app" as const };

/**
 * O agendador da Vercel manda "Authorization: Bearer <CRON_SECRET>" nos jobs de vercel.json.
 * Só vale em /api/cron/ e só com segredo de pelo menos 16 caracteres; sem segredo certo não há
 * identidade e a Sentinela responde 401 (sem_login). A rota continua conferindo o CRON_SECRET.
 */
function agendadorDaVercel(req: NextRequest): boolean {
  if (!req.nextUrl.pathname.startsWith("/api/cron/")) return false;
  const segredo = process.env.CRON_SECRET;
  if (typeof segredo !== "string" || segredo.length < 16) return false;
  const recebido = req.headers.get("authorization");
  if (!recebido) return false;
  return iguaisEmTempoConstante(recebido, "Bearer " + segredo);
}

/** Compara sem sair no primeiro byte diferente (o middleware roda no Edge, sem node:crypto). */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const ca = new TextEncoder().encode(a);
  const cb = new TextEncoder().encode(b);
  let dif = ca.length ^ cb.length;
  for (let i = 0; i < cb.length; i++) dif |= (i < ca.length ? ca[i] : 0) ^ cb[i];
  return dif === 0;
}

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  // Sentinela primeiro. A sessão do próprio app (cookie gti_sessao) vira a identidade do evento;
  // em /api/cron/, o agendador da Vercel com o segredo certo entra como robô.
  const sessao = await verificarSessao(req.cookies.get(COOKIE_SESSAO)?.value);
  const identidade = agendadorDaVercel(req)
    ? ROBO_AGENDADOR
    : sessao?.email ? { email: sessao.email, origem: "sessao_app" as const } : undefined;
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
