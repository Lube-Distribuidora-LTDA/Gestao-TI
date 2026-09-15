import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { cronAutorizado } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Abre as competências do mês corrente para todas as contas ativas.
 * Roda todo dia 1º — a função no banco ignora o que já existe, então
 * rodar de novo no mesmo mês não duplica nada.
 */
export async function GET(req: Request) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const db = supabaseAdmin();

  const execucao = await db
    .from("robo_execucoes")
    .insert({ tipo: "geracao_faturas" })
    .select("id")
    .single();

  const { data, error } = await db.rpc("gerar_faturas_competencia", { p_competencia: null });

  const r = Array.isArray(data) ? data[0] : data;

  await db
    .from("robo_execucoes")
    .update({
      finalizado_em: new Date().toISOString(),
      sucesso: !error,
      erro: error?.message ?? null,
      detalhes: { criadas: r?.criadas ?? 0, existentes: r?.existentes ?? 0 },
    })
    .eq("id", execucao.data?.id);

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({
    tarefa: "geracao_faturas",
    criadas: r?.criadas ?? 0,
    existentes: r?.existentes ?? 0,
  });
}

export const POST = GET;
