import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";
import { consultarFaturas } from "@/lib/consulta-faturas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista faturas com todos os filtros da tela. */
export async function GET(req: Request) {
  const { data, error } = await consultarFaturas(new URL(req.url).searchParams);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({ dados: data ?? [] });
}

/** Gera as faturas de uma competência a partir das contas ativas. */
export async function POST(req: Request) {
  if (!podeEscrever(await sessaoAtual())) {
    return NextResponse.json({ erro: "Seu perfil não permite esta ação." }, { status: 403 });
  }

  const { competencia } = await req.json();
  const db = supabaseAdmin();

  const { data, error } = await db.rpc("gerar_faturas_competencia", {
    p_competencia: competencia ?? null,
  });

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  const r = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    criadas: r?.criadas ?? 0,
    existentes: r?.existentes ?? 0,
  });
}
