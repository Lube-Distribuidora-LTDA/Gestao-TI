import { ImapFlow } from "imapflow";

/**
 * Guarda uma cópia da mensagem enviada na pasta "Enviados" do webmail.
 *
 * O SMTP só transmite: quem grava a cópia em Enviados é o programa de e-mail,
 * por IMAP. Sem isso, a cobrança saía de verdade — o servidor confirmava a
 * entrega — mas não aparecia em lugar nenhum do webmail, e dava a impressão
 * de que nada tinha sido enviado.
 *
 * Falha aqui nunca derruba o envio: a mensagem já está a caminho, e ficar sem
 * a cópia é bem menos grave do que reportar um erro que não existe.
 */

/** Nomes usados por servidores de e-mail para a pasta de enviados. */
const CANDIDATAS = [
  "INBOX.enviadas",
  "INBOX.Sent",
  "INBOX.Itens Enviados",
  "Sent",
  "Enviados",
];

let pastaDescoberta: string | null | undefined;

async function acharPastaEnviados(client: ImapFlow): Promise<string | null> {
  if (pastaDescoberta !== undefined) return pastaDescoberta;

  try {
    const lista = await client.list();

    // o servidor pode marcar a pasta com o atributo especial \Sent
    const especial = lista.find((p) => p.specialUse === "\\Sent");
    if (especial) return (pastaDescoberta = especial.path);

    const existentes = new Set(lista.map((p) => p.path));
    for (const nome of CANDIDATAS) {
      if (existentes.has(nome)) return (pastaDescoberta = nome);
    }
  } catch {
    /* segue para o retorno nulo */
  }

  return (pastaDescoberta = null);
}

export async function guardarEmEnviados(mensagemBruta: string | Buffer): Promise<boolean> {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;
  if (!host || !user || !pass) return false;

  let client: ImapFlow | null = null;

  try {
    client = new ImapFlow({
      host,
      port: Number(process.env.IMAP_PORT ?? 993),
      secure: true,
      auth: { user, pass },
      logger: false,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });

    await client.connect();

    const pasta = await acharPastaEnviados(client);
    if (!pasta) {
      await client.logout();
      return false;
    }

    // \Seen porque a cópia já foi lida por quem a escreveu
    await client.append(pasta, mensagemBruta, ["\\Seen"]);
    await client.logout();
    return true;
  } catch {
    try {
      await client?.close();
    } catch {
      /* conexão já caiu */
    }
    return false;
  }
}
