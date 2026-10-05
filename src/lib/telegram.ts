/**
 * Envio de mensagem pelo bot do Telegram.
 *
 * Escolhido como primeiro canal porque não depende de aprovação de ninguém:
 * o bot nasce no BotFather e já manda. A intenção é migrar para o WhatsApp
 * (API oficial da Meta) depois — por isso o conteúdo da mensagem é montado
 * em `resumo-diario.ts`, separado daqui: trocar o canal não refaz o resumo.
 */

const LIMITE_TELEGRAM = 4096;

export type EnvioTelegram = { enviadas: number; erro?: string };

/**
 * Quebra a mensagem em pedaços que cabem no limite do Telegram, cortando
 * sempre em quebra de linha — partir no meio de uma tag HTML derruba a
 * mensagem inteira com "can't parse entities".
 */
export function fatiar(texto: string, limite = LIMITE_TELEGRAM): string[] {
  if (texto.length <= limite) return [texto];

  const partes: string[] = [];
  let atual = "";
  for (const linha of texto.split("\n")) {
    // linha sozinha maior que o limite é caso teórico; corta na força bruta
    if (linha.length > limite) {
      if (atual) { partes.push(atual); atual = ""; }
      for (let i = 0; i < linha.length; i += limite) partes.push(linha.slice(i, i + limite));
      continue;
    }
    if (atual.length + linha.length + 1 > limite) {
      partes.push(atual);
      atual = linha;
    } else {
      atual = atual ? `${atual}\n${linha}` : linha;
    }
  }
  if (atual) partes.push(atual);
  return partes;
}

export function telegramConfigurado(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function enviarTelegram(texto: string): Promise<EnvioTelegram> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chat) {
    return { enviadas: 0, erro: "TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurados." };
  }

  const partes = fatiar(texto);
  let enviadas = 0;

  for (const parte of partes) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: parte,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!r.ok) {
      /* A resposta de erro do Telegram traz a descrição do problema; sem ela
         o diagnóstico vira adivinhação (token errado? chat errado? HTML
         inválido?). O token nunca entra na mensagem de erro. */
      const corpo = await r.text().catch(() => "");
      let descricao = corpo.slice(0, 300);
      try {
        const j = JSON.parse(corpo);
        if (j?.description) descricao = String(j.description);
      } catch { /* resposta não era JSON */ }
      return { enviadas, erro: `Telegram respondeu ${r.status}: ${descricao}` };
    }
    enviadas++;
  }

  return { enviadas };
}
