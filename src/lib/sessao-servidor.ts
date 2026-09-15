import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verificarSessao, COOKIE_SESSAO, type Sessao } from "./auth";

/** Lê a sessão atual dentro de Server Components e Route Handlers. */
export async function sessaoAtual(): Promise<Sessao | null> {
  const jar = await cookies();
  return verificarSessao(jar.get(COOKIE_SESSAO)?.value);
}

/** Usa em páginas protegidas: devolve a sessão ou manda para o login. */
export async function exigirSessao(): Promise<Sessao> {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  return s;
}

/** Bloqueia ação de escrita para o perfil "leitor". */
export function podeEscrever(s: Sessao | null): boolean {
  return !!s && (s.papel === "admin" || s.papel === "tecnico");
}
