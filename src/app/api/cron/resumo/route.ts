import { NextResponse } from "next/server";
import { montarResumo, formatarResumoTelegram } from "@/lib/resumo-diario";
import { enviarTelegram, telegramConfigurado, descobrirChats } from "@/lib/telegram";
import { cronAutorizado } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Resumo diário no Telegram.
 *
 * `?preview=1` devolve o texto sem mandar nada — é como se confere o formato
 * sem encher o celular de teste.
 *
 * Não tem agendamento próprio: o plano Hobby da Vercel só permite dois, e os
 * dois já são a leitura (08:00) e a cobrança (09:00). Quem chama isto é a
 * rodada da cobrança, no fim do trabalho dela — que é exatamente quando já se
 * sabe o que chegou de madrugada e o que foi cobrado.
 */
export async function GET(req: Request) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const url = new URL(req.url);
  const preview = url.searchParams.get("preview") === "1";
  const horas = Number(url.searchParams.get("horas") ?? 24);

  // passo de configuração: mostra o chat_id a usar, sem expor o token
  if (url.searchParams.get("descobrir") === "1") {
    const { chats, erro } = await descobrirChats();
    return NextResponse.json({
      tarefa: "descobrir-chat",
      chats,
      erro,
      dica: chats.length
        ? "Grave o id em TELEGRAM_CHAT_ID na Vercel e faça um novo deploy."
        : "Mande qualquer mensagem ao bot no Telegram e chame de novo (o Telegram guarda as atualizações por ~24h).",
    });
  }

  const resumo = await montarResumo(Number.isFinite(horas) && horas > 0 ? horas : 24);
  const texto = formatarResumoTelegram(resumo, process.env.NEXT_PUBLIC_APP_URL);

  const contagem = {
    venceHoje: resumo.venceHoje.length,
    venceuAgora: resumo.venceuAgora.length,
    venceEmBreve: resumo.venceEmBreve.length,
    chegaram: resumo.chegaram.length,
    faltando: resumo.faltando.length,
    revisar: resumo.revisar.length,
  };

  if (preview) {
    return NextResponse.json({ tarefa: "resumo", preview: true, contagem, texto });
  }

  // nada a dizer hoje: silêncio em vez de um "sem novidades" diário
  if (!texto) {
    return NextResponse.json({ tarefa: "resumo", enviado: false, motivo: "nada a relatar", contagem });
  }

  if (!telegramConfigurado()) {
    return NextResponse.json({ tarefa: "resumo", enviado: false, motivo: "Telegram não configurado", contagem });
  }

  const envio = await enviarTelegram(texto);
  return NextResponse.json({
    tarefa: "resumo",
    enviado: envio.enviadas > 0,
    mensagens: envio.enviadas,
    erro: envio.erro,
    contagem,
  });
}

export const POST = GET;
