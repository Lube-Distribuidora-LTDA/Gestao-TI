import nodemailer, { Transporter } from "nodemailer";

/**
 * Envio de e-mail via SMTP da Locaweb.
 *
 * Variáveis esperadas (.env.local / Vercel):
 *   SMTP_HOST=email-ssl.com.br      (padrão Locaweb)
 *   SMTP_PORT=465
 *   SMTP_SECURE=true
 *   SMTP_USER=cpd@lube.com.br
 *   SMTP_PASS=<senha do e-mail>
 *   SMTP_FROM_NOME=TI - Lube Distribuidora
 */

let transporter: Transporter | null = null;

export function getTransporter(): Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS nas variáveis de ambiente."
    );
  }

  const port = Number(process.env.SMTP_PORT ?? 465);

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: { user, pass },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  });

  return transporter;
}

export function remetente(): string {
  const nome = process.env.SMTP_FROM_NOME ?? "TI - Lube Distribuidora";
  const email = process.env.SMTP_USER ?? "cpd@lube.com.br";
  return `"${nome}" <${email}>`;
}

export type ResultadoEnvio = { ok: true; messageId: string } | { ok: false; erro: string };

export async function enviarEmail(opts: {
  para: string;
  assunto: string;
  html: string;
  texto?: string;
  responderPara?: string;
  cc?: string;
}): Promise<ResultadoEnvio> {
  try {
    const info = await getTransporter().sendMail({
      from: remetente(),
      to: opts.para,
      cc: opts.cc,
      replyTo: opts.responderPara ?? process.env.SMTP_USER,
      subject: opts.assunto,
      html: opts.html,
      text: opts.texto ?? htmlParaTexto(opts.html),
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Testa a conexão SMTP sem enviar nada — usado na tela de Configurações. */
export async function testarConexaoSMTP(): Promise<ResultadoEnvio> {
  try {
    await getTransporter().verify();
    return { ok: true, messageId: "conexao-ok" };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

function htmlParaTexto(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Escapa texto que vai para dentro do HTML do e-mail. */
export function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
