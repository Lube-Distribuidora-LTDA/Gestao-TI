import { ImapFlow } from "imapflow";
import { simpleParser, type Attachment } from "mailparser";

/**
 * Leitura do webmail (Locaweb) por IMAP.
 *
 * Variáveis esperadas:
 *   IMAP_HOST=email-ssl.com.br   (o certificado da Locaweb e *.email-ssl.com.br,
 *                                 entao imap.<dominio> quebra a validacao TLS)
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
  /*
   * Quantos candidatos novos o limite deixou de fora. Precisa aparecer no
   * painel: até set/2026 o corte era silencioso, e a nota de agosto da Mais
   * Dados ficou dois meses fora do sistema sem que nada indicasse a falta.
   */
  cortados: number;
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
 * baixar tudo é inviável dentro dos 60s de uma função serverless. A varredura
 * acontece em três fases, cada uma mais cara que a anterior:
 *
 *   1. percorremos as últimas mensagens que chegaram e cortamos por data;
 *   2. das que vieram de fornecedor cadastrado, olhamos a estrutura para saber
 *      quais trazem anexo de documento;
 *   3. só então o corpo completo é baixado — normalmente meia dúzia de e-mails.
 *
 * Nada é marcado como lido — a caixa fica exatamente como estava.
 */
export async function lerEmailsRecentes(opts: {
  dias: number;
  pasta?: string;
  limite?: number;
  /** Endereços e domínios (`@dominio.com.br`) dos fornecedores cadastrados. */
  remetentesConhecidos?: string[];
  /*
   * Endereços/domínios de fornecedor cujo documento chega como link de
   * portal, sem anexo (a SAAM, via ContaAzul). Sem esta lista, a triagem
   * abaixo descarta esse e-mail antes mesmo de o robô decidir qualquer coisa
   * — ela nunca vira "candidato" porque não tem PDF nem XML.
   */
  remetentesSemAnexo?: string[];
  /*
   * Message-IDs que o robô já processou em execuções anteriores. Descartar
   * esses antes da fase cara é o que faz o limite render: antes, baixar de
   * novo os mesmos e-mails consumia a cota e empurrava os documentos novos
   * para fora do corte.
   */
  jaProcessados?: Set<string>;
}): Promise<ResultadoVarredura> {
  const client = criarCliente();
  const emails: EmailLido[] = [];
  const limite = opts.limite ?? 60;
  const vistos = opts.jaProcessados ?? new Set<string>();

  const conhecidos = (opts.remetentesConhecidos ?? []).map((e) => e.toLowerCase().trim());
  const enderecos = new Set(conhecidos.filter((e) => !e.startsWith("@")));
  const dominios = new Set(conhecidos.filter((e) => e.startsWith("@")).map((e) => e.slice(1)));

  const interessa = (remetente: string): boolean => {
    if (enderecos.has(remetente)) return true;
    const dom = remetente.split("@")[1] ?? "";
    return dominios.has(dom);
  };

  const semAnexo = (opts.remetentesSemAnexo ?? []).map((e) => e.toLowerCase().trim());
  const enderecosSemAnexo = new Set(semAnexo.filter((e) => !e.startsWith("@")));
  const dominiosSemAnexo = new Set(semAnexo.filter((e) => e.startsWith("@")).map((e) => e.slice(1)));

  const podeVirSemAnexo = (remetente: string): boolean => {
    if (enderecosSemAnexo.has(remetente)) return true;
    const dom = remetente.split("@")[1] ?? "";
    return dominiosSemAnexo.has(dom);
  };

  // Sem fornecedores cadastrados não há a que vincular documento algum —
  // baixar centenas de e-mails aqui seria trabalho jogado fora.
  if (enderecos.size === 0 && dominios.size === 0) {
    return { emails: [], totalNoPeriodo: 0, candidatos: 0, baixados: 0, cortados: 0 };
  }

  await client.connect();

  const pasta = opts.pasta || process.env.IMAP_PASTA || "INBOX";
  const lock = await client.getMailboxLock(pasta);

  let totalNoPeriodo = 0;
  let cortados = 0;
  const candidatos: Array<{ uid: number; remetente: string }> = [];

  try {
    const desde = new Date(Date.now() - opts.dias * 86_400_000);

    /*
     * ---------- fase 1: pegar as mensagens que chegaram por último ----------
     *
     * Não usamos `SEARCH SINCE`: o servidor da Locaweb responde a esse
     * critério com mensagens fora do período pedido (uma busca por "últimos
     * 50 dias" devolveu correspondência de sete meses antes, e nenhuma das
     * notas recentes). Como o resultado não é confiável, percorremos a caixa
     * pelo fim — as últimas mensagens em ordem de chegada — e aplicamos o
     * corte de data aqui, pela data interna de cada mensagem.
     *
     * A janela é dimensionada pelo volume da caixa (cerca de 50 mensagens por
     * dia), com folga e um teto para não estourar o tempo da função.
     */
    const total = client.mailbox && typeof client.mailbox === "object"
      ? (client.mailbox as { exists: number }).exists
      : 0;

    if (total === 0) {
      return { emails: [], totalNoPeriodo: 0, candidatos: 0, baixados: 0, cortados: 0 };
    }

    const janela = Math.min(Math.max(opts.dias * 120, 300), 2000);
    const inicio = Math.max(1, total - janela + 1);

    for await (const msg of client.fetch(
      `${inicio}:${total}`,
      { uid: true, envelope: true, bodyStructure: true, internalDate: true }
    )) {
      // a data interna é quando a mensagem chegou; o cabeçalho Date é
      // informado por quem envia e vem forjado com frequência em spam
      const chegada = msg.internalDate ? new Date(msg.internalDate) : null;
      if (chegada && chegada < desde) continue;

      totalNoPeriodo++;

      const from = msg.envelope?.from?.[0];
      const remetente = (from?.address ?? "").toLowerCase().trim();

      if (!interessa(remetente)) continue;
      if (!temAnexoRelevante(msg.bodyStructure) && !podeVirSemAnexo(remetente)) continue;

      /*
       * E-mail já processado antes não precisa ser baixado de novo. Isso era
       * checado só depois do download, então cada varredura gastava o limite
       * relendo os mesmos documentos do mês passado — e o que sobrava não
       * alcançava as notas mais antigas da janela.
       */
      const messageId = (msg.envelope?.messageId ?? "").trim();
      if (messageId && vistos.has(messageId)) continue;

      candidatos.push({ uid: msg.uid, remetente });
    }

    if (candidatos.length === 0) {
      return { emails: [], totalNoPeriodo, candidatos: 0, baixados: 0, cortados: 0 };
    }

    /*
     * O corte é feito depois de olhar a janela inteira, e pelas mensagens mais
     * recentes. Cortar durante a varredura descartava justamente as notas do
     * mês corrente: a leitura vai da mensagem mais antiga para a mais nova, e
     * numa janela de 60 dias o limite se esgotava antes de chegar às contas
     * que estavam para vencer.
     *
     * Só a triagem é ilimitada — ela custa pouco. O corte protege a etapa cara,
     * que é baixar o corpo de cada mensagem.
     */
    candidatos.sort((a, b) => b.uid - a.uid);
    cortados = Math.max(0, candidatos.length - limite);
    if (cortados > 0) candidatos.length = limite;

    // ---------- fase 3: baixar o corpo apenas dos escolhidos ----------
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

          const remetenteReal = (from?.address ?? "").toLowerCase().trim();

          // o bodyStructure prometeu anexo e era só assinatura — a menos que
          // este remetente seja um dos que mandam link em vez de anexo
          if (anexos.length === 0 && !podeVirSemAnexo(remetenteReal)) continue;

          emails.push({
            messageId: parsed.messageId ?? msg.envelope?.messageId ?? `uid-${msg.uid}-${pasta}`,
            uid: msg.uid,
            remetente: remetenteReal,
            remetenteNome: from?.name ?? "",
            assunto: parsed.subject ?? "(sem assunto)",
            data: parsed.date ?? msg.envelope?.date ?? new Date(),
            /*
             * Espaço de largura zero (U+200B) e primos (ZWNJ, ZWJ, BOM) somem
             * aqui, na origem — a ContaAzul os insere entre dígitos de data
             * ("15/09/2026", invisível no e-mail) e isso quebrava qualquer
             * regex de data rio abaixo. Limpar uma vez aqui poupa cada função
             * de extração de reimplementar a mesma limpeza.
             */
            textoCorpo: (parsed.text ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "").slice(0, 4000),
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
    cortados,
  };
}

/* ============================================================
   CLASSIFICAÇÃO DE ANEXOS
   ============================================================ */

export type ClassificacaoAnexo = {
  tipo: "nota_fiscal" | "fatura" | "boleto" | "recibo" | "contrato" | "outro";
  confianca: "alta" | "media" | "baixa";
};

const PISTA_NOTA   = /(nfse|nfs-e|nf-e|nf_e|nfe|nota[\s_-]?fiscal|danfe|\bnf\b)/i;
const PISTA_BOLETO = /(boleto|\bbol\b|cobran[çc]a|t[íi]tulo)/i;
const PISTA_FATURA = /(fatura|invoice|demonstrativo|conta[\s_-]?de)/i;
const PISTA_CONTRATO = /(contrato|aditivo|proposta|relat[óo]rio|ata[\s_-]|termo)/i;
/*
 * Recibo é o comprovante de um pagamento que já aconteceu — o oposto de um
 * boleto. As assinaturas de software no exterior só emitem isto: a Anthropic
 * manda "Receipt-2260-7279-4892.pdf" junto com o "Invoice", e sem esta pista
 * o recibo caía em "outro" e a conta ficava aguardando um documento que já
 * estava lá.
 */
const PISTA_RECIBO = /(recibo|receipt|comprovante[\s_-]?de[\s_-]?pagamento)/i;

/**
 * Descobre se o anexo é nota fiscal, fatura ou boleto.
 *
 * O **nome do arquivo decide**; o assunto só entra quando o nome não diz nada.
 * Essa ordem importa: o mesmo e-mail costuma levar a nota e o boleto juntos,
 * com assunto do tipo "Boleto - FORNECEDOR - NFS-e: 2284". Misturar nome e
 * assunto numa única busca fazia o `NFSE_2284.pdf` ser marcado como boleto,
 * porque a palavra "boleto" aparecia no assunto.
 *
 * A classificação é conservadora de propósito: sem pista suficiente, devolve
 * confiança baixa e a tela pede confirmação em vez de fingir certeza.
 */
export function classificarAnexo(nomeArquivo: string, assunto: string): ClassificacaoAnexo {
  const nome = nomeArquivo.toLowerCase();

  // XML no Brasil é praticamente sempre NF-e / NFS-e
  if (/\.xml$/i.test(nome)) return { tipo: "nota_fiscal", confianca: "alta" };

  // ---------- 1. o nome do arquivo, sozinho ----------
  const notaNoNome   = PISTA_NOTA.test(nome);
  const boletoNoNome = PISTA_BOLETO.test(nome);

  // "NFSe 934 - LUBE (FIREWALL) boleto.pdf" cita os dois: a nota prevalece,
  // porque é o documento que o arquivo representa
  if (notaNoNome)   return { tipo: "nota_fiscal", confianca: "alta" };
  if (boletoNoNome) return { tipo: "boleto", confianca: "alta" };
  if (PISTA_RECIBO.test(nome))   return { tipo: "recibo", confianca: "alta" };
  if (PISTA_FATURA.test(nome))   return { tipo: "fatura", confianca: "alta" };
  if (PISTA_CONTRATO.test(nome)) return { tipo: "contrato", confianca: "media" };

  // ---------- 2. o assunto, como pista secundária ----------
  const a = assunto.toLowerCase();

  // no assunto a ordem se inverte: quem anuncia "Boleto ..." costuma anexar o
  // boleto, e a nota vem citada só como referência
  if (PISTA_BOLETO.test(a)) return { tipo: "boleto", confianca: "media" };
  if (PISTA_NOTA.test(a))   return { tipo: "nota_fiscal", confianca: "media" };
  if (PISTA_RECIBO.test(a)) return { tipo: "recibo", confianca: "media" };
  if (PISTA_FATURA.test(a)) return { tipo: "fatura", confianca: "media" };
  if (PISTA_CONTRATO.test(a)) return { tipo: "contrato", confianca: "baixa" };

  // PDF sem nenhuma pista: é documento, mas não sabemos qual
  return { tipo: "outro", confianca: "baixa" };
}

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4,
  maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9,
  outubro: 10, novembro: 11, dezembro: 12,
};

const NOME_MES = "janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";

/**
 * Tenta achar a competência (mês de referência) citada no assunto/corpo.
 *
 * `recebidoEm` serve para o caso mais comum no Brasil: o assunto traz só o
 * nome do mês, sem ano — "NOTA FISCAL | LUBE | JULHO | FIREWALL". Aí o ano vem
 * da data de chegada, e um mês à frente dessa data é entendido como do ano
 * anterior (uma nota de dezembro que chega em janeiro).
 */
export function extrairCompetencia(texto: string, recebidoEm?: Date): string | null {
  const t = texto.toLowerCase();

  // 09/2026 ou 09-2026
  const m1 = t.match(/\b(0?[1-9]|1[0-2])[\/\-](20\d{2})\b/);
  if (m1) return `${m1[2]}-${String(m1[1]).padStart(2, "0")}-01`;

  // 2026-09
  const m2 = t.match(/\b(20\d{2})[\/\-](0?[1-9]|1[0-2])\b/);
  if (m2) return `${m2[1]}-${String(m2[2]).padStart(2, "0")}-01`;

  // "setembro/2026", "setembro de 2026"
  const m3 = t.match(new RegExp(`\\b(${NOME_MES})\\s*(?:\\/|de\\s+|\\s+)(20\\d{2})\\b`));
  if (m3) {
    const mes = MESES[m3[1]];
    if (mes) return `${m3[2]}-${String(mes).padStart(2, "0")}-01`;
  }

  // Só o nome do mês, sem ano — o ano vem de quando a mensagem chegou.
  const m4 = t.match(new RegExp(`\\b(${NOME_MES})\\b`));
  if (m4 && recebidoEm) {
    const mes = MESES[m4[1]];
    if (mes) {
      let ano = recebidoEm.getFullYear();
      // mês posterior à chegada só faz sentido como do ano passado
      if (mes > recebidoEm.getMonth() + 1 + 1) ano -= 1;
      return `${ano}-${String(mes).padStart(2, "0")}-01`;
    }
  }

  return null;
}

/**
 * Procura a data de vencimento anunciada no assunto ou no corpo.
 *
 * O texto é a fonte confiável: o fornecedor escreve "Vencimento 15/09" com
 * todas as letras. O nome do arquivo engana — a Print Solução nomeia a nota
 * como "NFSe 934 -26 - LUBE (FIREWALL) - 09-24 .pdf" e esse "09-24" não é o
 * vencimento, que naquele mesmo e-mail era 15/09.
 *
 * `referencia` completa o ano quando a data vem sem ele ("Vencimento 15/09").
 */
export function extrairVencimento(texto: string, referencia?: Date): string | null {
  /*
   * Dois problemas de codificação, além de espaço duplo, precisam sumir antes
   * de qualquer regex:
   *
   *   - espaço de largura zero (U+200B) — a ContaAzul o insere entre o dia, o
   *     mês e o ano ("15/09/2026"), invisível no e-mail mas que quebra
   *     qualquer [\/.\-] logo depois de um "/";
   *   - a mesma limpeza vale para ZWNJ/ZWJ/BOM, que aparecem por motivos
   *     parecidos em texto convertido de HTML para texto puro.
   */
  const t = texto.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ");

  /*
   * O trecho entre "vencimento" e a data pode ser só pontuação ("Venc.:") ou
   * ter uma palavra de ligação no meio ("vencimento em", "vencimento para o
   * dia") — a ContaAzul usa "em". Por isso o quantificador é preguiçoso sobre
   * qualquer caractere, não uma lista fixa de separadores: ele para na
   * primeira data completa que encontrar, então não avança para uma data mais
   * distante e desligada do rótulo.
   */
  const comAno = t.match(/venc[a-zà-ú]*.{0,20}?(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})/i);
  if (comAno) {
    const [, d, m, a] = comAno;
    return `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // "Vencimento15/09" — sem ano, e às vezes sem espaço antes do número
  const semAno = t.match(/venc[a-zà-ú]*.{0,20}?(\d{1,2})[\/.\-](\d{1,2})(?![\/.\-]?\d)/i);
  if (semAno && referencia) {
    const dia = Number(semAno[1]);
    const mes = Number(semAno[2]);
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      let ano = referencia.getFullYear();
      // vencimento muitos meses atrás da referência é do ano seguinte
      if (mes < referencia.getMonth() + 1 - 6) ano += 1;
      return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    }
  }

  return null;
}

/** Extrai um possível número de nota fiscal do assunto/nome do arquivo. */
export function extrairNumeroNota(texto: string): string | null {
  const m = texto.match(/\b(?:nf|nfe|nfse|nota|n[º°.]?)\s*[:\-]?\s*(\d{3,12})\b/i);
  return m ? m[1] : null;
}

/*
 * Fornecedor que manda nota e boleto como link de portal, não anexo.
 *
 * A SAAM migrou da Omie (anexava PDF) para o ContaAzul (só link), e trocou de
 * formato de link pelo caminho — os dois convivem em mensagens antigas e
 * recentes:
 *   https://app.contaazul.com/pub/#/invoice/v2/<id>
 *   https://faturas.contaazul.com/#/fatura/visualizar/<id>
 *
 * O padrão é restrito de propósito, ao contrário de "qualquer link https": o
 * mesmo e-mail carrega link de rastreio do SendGrid, link de ajuda, link do
 * WhatsApp do suporte. Pegar o primeiro link que aparecer pegaria um desses.
 */
const PADROES_LINK_PORTAL = [
  /https:\/\/app\.contaazul\.com\/pub\/#\/invoice\/v2\/[0-9a-f-]+/i,
  /https:\/\/faturas\.contaazul\.com\/#\/fatura\/visualizar\/[0-9a-f-]+/i,
];

export function extrairLinkDoPortal(texto: string): string | null {
  for (const padrao of PADROES_LINK_PORTAL) {
    const m = texto.match(padrao);
    if (m) return m[0];
  }
  return null;
}
