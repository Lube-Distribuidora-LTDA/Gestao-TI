import { NextResponse } from "next/server";
import { executarCobrancas } from "@/lib/robo";
import { supabaseAdmin } from "@/lib/supabase";
import { cronAutorizado } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Cobra os fornecedores que ainda não enviaram nota/fatura.
 *
 * Antes de cobrar, garante que as competências do mês corrente existam. Isso
 * cabe aqui porque o plano Hobby da Vercel só permite dois agendamentos — e a
 * função no banco é idempotente, então rodar todo dia não duplica nada: ela
 * ignora as competências que já existem.
 */
export async function GET(req: Request) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  let competencias = { criadas: 0, existentes: 0 };
  try {
    const { data } = await supabaseAdmin().rpc("gerar_faturas_competencia", {
      p_competencia: null,
    });
    const r = Array.isArray(data) ? data[0] : data;
    competencias = { criadas: r?.criadas ?? 0, existentes: r?.existentes ?? 0 };
  } catch {
    // falha ao abrir competências não impede a cobrança das que já existem
  }

  const r = await executarCobrancas();

  return NextResponse.json({
    tarefa: "cobranca",
    competencias,
    ...r,
    detalhes: r.detalhes.slice(0, 30),
  });
}

export const POST = GET;
