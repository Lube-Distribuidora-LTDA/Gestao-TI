import { NextResponse } from "next/server";
import { executarCobrancas } from "@/lib/robo";
import { supabaseAdmin } from "@/lib/supabase";
import { cronAutorizado } from "@/lib/cron";
import { montarResumo, formatarResumoTelegram } from "@/lib/resumo-diario";
import { enviarTelegram, telegramConfigurado } from "@/lib/telegram";

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

  /*
   * O erro de abrir competências não derruba a cobrança do que já existe —
   * mas precisa aparecer. Um `catch` vazio aqui escondeu, por semanas, que
   * nenhuma competência estava sendo aberta: em 06/10/2026 havia 26 contas
   * ativas e 4 faturas de outubro, todas criadas pelo robô ao receber
   * documento. Falha silenciosa num passo diário é indistinguível de sucesso.
   */
  let competencias: { criadas: number; existentes: number; erro?: string } = {
    criadas: 0,
    existentes: 0,
  };
  try {
    const { data, error } = await supabaseAdmin().rpc("gerar_faturas_competencia", {
      p_competencia: null,
    });
    if (error) throw new Error(error.message);
    const r = Array.isArray(data) ? data[0] : data;
    competencias = { criadas: r?.criadas ?? 0, existentes: r?.existentes ?? 0 };
  } catch (e) {
    competencias.erro = e instanceof Error ? e.message : String(e);
  }

  const r = await executarCobrancas();

  /*
   * O resumo no Telegram sai daqui, e não de um agendamento próprio: o plano
   * Hobby só permite dois, e os dois já são a leitura e esta cobrança. Esta
   * também é a hora certa — a leitura das 08:00 já passou, então o resumo sabe
   * o que chegou de madrugada.
   *
   * Falha de envio não pode derrubar a cobrança, que é o trabalho principal:
   * o erro é reportado na resposta e a rodada segue dada como boa.
   */
  let resumo: { enviado: boolean; mensagens?: number; motivo?: string; erro?: string } = {
    enviado: false,
    motivo: "Telegram não configurado",
  };

  if (telegramConfigurado()) {
    try {
      const texto = formatarResumoTelegram(await montarResumo(), process.env.NEXT_PUBLIC_APP_URL);
      if (!texto) {
        resumo = { enviado: false, motivo: "nada a relatar" };
      } else {
        const envio = await enviarTelegram(texto);
        resumo = { enviado: envio.enviadas > 0, mensagens: envio.enviadas, erro: envio.erro };
      }
    } catch (e) {
      resumo = { enviado: false, erro: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({
    tarefa: "cobranca",
    competencias,
    ...r,
    resumo,
    detalhes: r.detalhes.slice(0, 30),
  });
}

export const POST = GET;
