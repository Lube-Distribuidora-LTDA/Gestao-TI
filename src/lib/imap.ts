import { ImapFlow } from "imapflow";
import { simpleParser, type Attachment } from "mailparser";

/**
 * Leitura do webmail (Locaweb) por IMAP.
 *
 * Variáveis esperadas:
 *   IMAP_HOST=imap.lube.com.br   (ou email-ssl.com.br)
 *   IMAP_PORT=993
 *   IMAP_USER=cpd@lube.com.br
 *   IMAP_PASS=<senha do e-mail>
 *   IMAP_PASTA=INBOX
 */

export type AnexoEmail = {
  nome: string;
  mime: string;
  tamanho: number;
  conteudo: Buffer;
};

export type EmailLido = {
  messageId: string;
  uid: number;
  remetente: string;
  remetenteNome: string;
  assunto: string;
  data: Date;
  textoCorpo: string;
  anexos: AnexoEmail[];
};

/** Extensões que interessam ao processo de nota fiscal / fatura. */
const EXTENSOES_DOC = /\.(pdf|xml|p7s|zip|jpg|jpeg|png)$/i;

/** Anexos que são só assinatura/logo de e-mail — devem ser descartados. */
function ehLixo(a: Attachment): boolean {
  const nome = (a.filename ?? "").toLowerCase();
  if (!nome) return true;
  // imagens embutidas na assinatura costumam vir como 'inline' e bem pequenas
  if (a.contentDisposition === "inline" && (a.size ?? 0) < 60_000) return true;
  if (/^(image00|logo|assinatura|signature|banner|icon|spacer)/i.test(nome)) return true;
  if (!EXTENSOES_DOC.test(nome)) return true;
  return false;
}

export function imapConfigurado(): boolean {
  return !!(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASS);
}

function criarCliente(): ImapFlow {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "IMAP não configurado. Defina IMAP_HOST, IMAP_USER e IMAP_PASS nas variáveis de ambiente."
    );
  }

  return new ImapFlow({
    host,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: { user, pass },
    logger: false,
    // a Locaweb às vezes demora a responder o greeting
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });
}

/** Testa credenciais sem ler nada — usado na tela de Configurações. */
export async function testarConexaoIMAP(): Promise<{ ok: boolean; erro?: string; pastas?: string[] }> {
  let client: ImapFlow | null = null;
  try {
    client = criarCliente();
    await client.connect();
    const lista = await client.list();
    const pastas = lista.map((p) => p.path).slice(0, 40);
    await client.logout();
    return { ok: true, pastas };
  } catch (e) {
    try {
      await client?.close();
    } catch {
      /* conexão já caiu */
    }
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** O que a varredura devolve, além dos e-mails que interessam. */
export type ResultadoVarredura = {
  emails: EmailLido[];
  totalNoPeriodo: number;   // quantos e-mails existiam na janela
  candidatos: number;       // quantos passaram no filtro de remetente + anexo
  baixados: number;         // de quantos o corpo foi realmente baixado
};

/** Diz se o bodyStructure indica algum anexo que valha a pena baixar. */
function temAnexoRelevante(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as {
    disposition?: string;
    dispositionParameters?: { filename?: string };
    parameters?: { name?: string };
    type?: string;
    childNodes?: unknown[];
  };

  const nome = n.dispositionParameters?.filename ?? n.parameters?.name ?? "";
  if (nome && EXTENSOES_DOC.test(nome)) return true;

  // alguns servidores não mandam o nome; aceitamos pelo tipo do conteúdo
  const tipo = (n.type ?? "").toLowerCase();
  if (
    n.disposition === "attachment" &&
    (tipo === "application/pdf" || tipo.includes("xml") || tipo === "application/octet-stream")
  ) {
    return true;
  }

  return (n.childNodes ?? []).some((c) => temAnexoRelevante(c));
}

/**
 * Lê os e-mails recebidos nos últimos `dias` dias.
 *
 * A caixa da TI tem dezenas de milhares de mensagens e recebe ~50 por dia, então
 * baixar tudo é inviável dentro do tempo de uma função serverless. A varredura é
 * feita em duas fases:
 *
 *   1. busca só os envelopes (remetente, assunto, estrutura) — rápido e leve;
 *   2. baixa o corpo completo apenas dos e-mails que vieram de um fornecedor
 *      cadastrado E que têm anexo de documento.
 *
 * Na prática isso reduz centenas de downloads para meia dúzia.
 *
 * Nada é marcado como lido — a caixa fica exatamente como estava.
 */
export async function lerEmailsRecentes(opts: {
  dias: number;
  pasta?: string;
  limite?: number;
  /** Endereços e domínios (`@dominio.com.br`) dos fornecedores cadastrados. */
  remetentesConhecidos?: string[];
}): Promise<ResultadoVarredura> {
  const client = criarCliente();
  const emails: EmailLido[] = [];
  const limite = opts.limite ?? 60;

  const conhecidos = (opts.remetentesConhecidos ?? []).map((e) => e.toLowerCase().trim());
  const enderecos = new Set(conhecidos.filter((e) => !e.startsWith("@")));
  const dominios = new Set(conhecidos.filter((e) => e.startsWith("@")).map((e) => e.slice(1)));

  const interessa = (remetente: string): boolean => {
    if (enderecos.has(remetente)) return true;
    const dom = remetente.split("@")[1] ?? "";
    return dominios.has(dom);
  };

  // Sem fornecedores cadastrados não há a que vincular documento algum —
  // baixar centenas de e-mails aqui seria trabalho jogado fora.
  if (enderecos.size === 0 && dominios.size === 0) {
    return { emails: [], totalNoPeriodo: 0, candidatos: 0, baixados: 0 };
  }

  await client.connect();

  const pasta = opts.pasta || process.env.IMAP_PASTA || "INBOX";
  const lock = await client.getMailboxLock(pasta);

  let totalNoPeriodo = 0;
  const candidatos: Array<{ uid: number; remetente: string }> = [];

  try {
    const desde = new Date(Date.now() - opts.dias * 86_400_000);

    // ---------- fase 1: triagem pelos envelopes ----------
    for await (const msg of client.fetch(
      { since: desde },
      { uid: true, envelope: true, bodyStructure: true }
    )) {
      totalNoPeriodo++;

      const from = msg.envelope?.from?.[0];
      const remetente = (from?.address ?? "").toLowerCase().trim();

      if (!interessa(remetente)) continue;
      if (!temAnexoRelevante(msg.bodyStructure)) continue;

      candidatos.push({ uid: msg.uid, remetente });
      if (candidatos.length >= limite) break;
    }

    // ---------- fase 2: baixar só os escolhidos ----------
    if (candidatos.length > 0) {
      const uids = candidatos.map((c) => c.uid);

      for await (const msg of client.fetch(
        uids,
        { uid: true, envelope: true, source: true },
        { uid: true }
      )) {
        if (!msg.source) continue;

        try {
          const parsed = await simpleParser(msg.source);
          const from = parsed.from?.value?.[0];

          const anexos: AnexoEmail[] = (parsed.attachments ?? [])
            .filter((a) => !ehLixo(a))
            .map((a) => ({
              nome: a.filename ?? "documento",
              mime: a.contentType ?? "application/octet-stream",
              tamanho: a.size ?? a.content?.length ?? 0,
              conteudo: a.content as Buffer,
            }));

          if (anexos.length === 0) continue; // o bodyStructure prometeu, mas era assinatura

          emails.push({
            messageId: parsed.messageId ?? msg.envelope?.messageId ?? `uid-${msg.uid}-${pasta}`,
            uid: msg.uid,
            remetente: (from?.address ?? "").toLowerCase().trim(),
            remetenteNome: from?.name ?? "",
            assunto: parsed.subject ?? "(sem assunto)",
            data: parsed.date ?? msg.envelope?.date ?? new Date(),
            textoCorpo: (parsed.text ?? "").slice(0, 4000),
            anexos,
          });
        } catch {
          // um e-mail malformado não pode derrubar a varredura inteira
          continue;
        }
      }
    }
  } finally {
    lock.release();
    try {
      await client.logout();
    } catch {
      /* ignora falha ao encerrar */
    }
  }

  return {
    emails,
    totalNoPeriodo,
    candidatos: candidatos.length,
    baixados: emails.length,
  };
}

/* ============================================================
   CLASSIFICAÇÃO DE ANEXOS
   ============================================================ */

export type ClassificacaoAnexo = {
  tipo: "nota_fiscal" | "fatura" | "boleto" | "contrato" | "outro";
  confianca: "alta" | "media" | "baixa";
};

/**
 * Descobre se o anexo é nota fiscal, fatura ou boleto.
 *
 * A classificação é deliberadamente conservadora: quando não há pista
 * suficiente, devolve confiança baixa e a tela pede confirmação humana em
 * vez de fingir certeza.
 */
export function classificarAnexo(nomeArquivo: string, assunto: string): ClassificacaoAnexo {
  const n = nomeArquivo.toLowerCase();
  const a = assunto.toLowerCase();
  const ctx = `${n} ${a}`;

  // XML no Brasil é praticamente sempre NF-e / NFS-e
  if (/\.xml$/i.test(n)) return { tipo: "nota_fiscal", confianca: "alta" };

  if (/\b(boleto|bol\b|cobranca|cobrança|titulo|título)/i.test(ctx))
    return { tipo: "boleto", confianca: "alta" };

  if (/\b(nfse|nfe|nf-e|nf_e|nfs-e|nota[\s_-]?fiscal|danfe|\bnf\b)/i.test(ctx))
    return { tipo: "nota_fiscal", confianca: "alta" };

  if (/\b(fatura|invoice|demonstrativo|conta[\s_-]?de)/i.test(ctx))
    return { tipo: "fatura", confianca: "alta" };

  if (/\b(contrato|aditivo|proposta)/i.test(ctx))
    return { tipo: "contrato", confianca: "media" };

  // PDF sem nenhuma pista: é documento, mas não sabemos qual
  if (/\.pdf$/i.test(n)) return { tipo: "outro", confianca: "baixa" };

  return { tipo: "outro", confianca: "baixa" };
}

/** Tenta achar a competência (mês de referência) citada no assunto/corpo. */
export function extrairCompetencia(texto: string): string | null {
  const t = texto.toLowerCase();

  // 09/2026 ou 09-2026
  const m1 = t.match(/\b(0?[1-9]|1[0-2])[\/\-](20\d{2})\b/);
  if (m1) return `${m1[2]}-${String(m1[1]).padStart(2, "0")}-01`;

  // 2026-09
  const m2 = t.match(/\b(20\d{2})[\/\-](0?[1-9]|1[0-2])\b/);
  if (m2) return `${m2[1]}-${String(m2[2]).padStart(2, "0")}-01`;

  // "setembro/2026", "setembro de 2026"
  const meses: Record<string, string> = {
    janeiro: "01", fevereiro: "02", marco: "03", março: "03", abril: "04",
    maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09",
    outubro: "10", novembro: "11", dezembro: "12",
  };
  const m3 = t.match(
    /\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:\/|de\s+|\s+)(20\d{2})\b/
  );
  if (m3) {
    const mes = meses[m3[1].replace("ç", "c")] ?? meses[m3[1]];
    if (mes) return `${m3[2]}-${mes}-01`;
  }

  return null;
}

/** Extrai um possível número de nota fiscal do assunto/nome do arquivo. */
export function extrairNumeroNota(texto: string): string | null {
  const m = texto.match(/\b(?:nf|nfe|nfse|nota|n[º°.]?)\s*[:\-]?\s*(\d{3,12})\b/i);
  return m ? m[1] : null;
}
