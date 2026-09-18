/*
 * Procura um documento em OUTRA caixa de e-mail da empresa.
 *
 * O robô lê só cpd@lube.com.br, e a Locaweb não dá acesso delegado entre
 * contas (o servidor não anuncia ACL e publica apenas a árvore pessoal). Para
 * olhar lube@, financeiro@ ou qualquer outra, é preciso a senha daquela conta.
 *
 * A senha é lida do ambiente e nunca é escrita em arquivo nenhum: quem roda
 * digita na própria máquina, e ela morre quando o terminal fecha.
 *
 * COMO USAR (no PowerShell, dentro da pasta do projeto):
 *
 *   $env:CAIXA_USER = "lube@lube.com.br"
 *   $env:CAIXA_PASS = "a senha dessa conta"
 *   node scripts/procurar-em-outra-caixa.mjs 68679
 *
 * Aceita vários termos: número de nota, CNPJ, remetente, trecho do assunto.
 *
 *   node scripts/procurar-em-outra-caixa.mjs 68679 07363764 fiscal@totvs.com.br
 *
 * Ao terminar, limpe a senha do terminal:  $env:CAIXA_PASS = $null
 *
 * Os anexos das mensagens encontradas são salvos em ./documentos-encontrados/.
 */
import fs from "node:fs";
import path from "node:path";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const termos = process.argv.slice(2).filter(Boolean);

if (termos.length === 0) {
  console.error("Informe o que procurar. Exemplo:\n  node scripts/procurar-em-outra-caixa.mjs 68679");
  process.exit(1);
}

const HOST = process.env.CAIXA_HOST || process.env.IMAP_HOST || "email-ssl.com.br";
const USER = process.env.CAIXA_USER;
const PASS = process.env.CAIXA_PASS;

if (!USER || !PASS) {
  console.error(
    "Defina a conta a consultar antes de rodar:\n" +
      '  $env:CAIXA_USER = "lube@lube.com.br"\n' +
      '  $env:CAIXA_PASS = "a senha dessa conta"\n\n' +
      "A senha fica só no seu terminal — não é gravada em lugar nenhum."
  );
  process.exit(1);
}

const DESTINO = "documentos-encontrados";

/* Os termos viram uma busca tolerante: "07.363.764" e "07363764" precisam
   casar com o mesmo documento, e o número da nota não pode casar com um
   pedaço de outro número maior. */
const testar = (texto) => {
  const limpo = texto.toLowerCase();
  const digitos = texto.replace(/\D/g, "");
  return termos.some((t) => {
    const td = t.replace(/\D/g, "");
    if (td.length >= 5 && td === t.replace(/[.\-/\s]/g, "")) {
      // termo numérico: casa por dígitos, ignorando pontuação
      return digitos.includes(td) || new RegExp(`(?:^|\\D)${td}(?:\\D|$)`).test(texto);
    }
    return limpo.includes(t.toLowerCase());
  });
};

const conectar = () =>
  new ImapFlow({
    host: HOST, port: Number(process.env.CAIXA_PORT ?? 993), secure: true,
    auth: { user: USER, pass: PASS },
    logger: false, socketTimeout: 120000, greetingTimeout: 20000,
  });

console.log(`Procurando ${termos.map((t) => `"${t}"`).join(", ")} em ${USER}\n`);

let pastas;
try {
  const c = conectar();
  c.on("error", () => {});
  await c.connect();
  pastas = (await c.list()).map((p) => p.path);
  await c.logout().catch(() => {});
} catch (err) {
  console.error("Não consegui entrar na conta:", err.message);
  console.error("Confira o endereço e a senha. Se a conta tiver verificação em duas etapas, use uma senha de aplicativo.");
  process.exit(1);
}

const achados = [];
let varridas = 0;

for (const pasta of pastas) {
  const c = conectar();
  c.on("error", () => {});

  try {
    await c.connect();
    const box = await c.mailboxOpen(pasta, { readOnly: true });
    if (!box.exists) {
      await c.logout().catch(() => {});
      continue;
    }

    /* Primeiro a triagem barata — assunto, remetente e nome dos anexos.
       Baixar o corpo de tudo levaria horas numa caixa antiga. */
    const candidatos = [];
    for await (const m of c.fetch("1:*", { envelope: true, internalDate: true, uid: true, bodyStructure: true })) {
      varridas++;
      const de = m.envelope?.from?.[0]?.address ?? "";
      const assunto = m.envelope?.subject ?? "";

      const anexos = [];
      const anda = (x) => {
        if (!x) return;
        const f = x.dispositionParameters?.filename || x.parameters?.name;
        if (f) anexos.push(f);
        (x.childNodes || []).forEach(anda);
      };
      anda(m.bodyStructure);

      if (testar(`${de} ${assunto} ${anexos.join(" ")}`)) {
        candidatos.push({ uid: m.uid, de, assunto, anexos, d: m.internalDate });
      }
    }

    for (const cand of candidatos) {
      try {
        const { content } = await c.download(`${cand.uid}`, undefined, { uid: true });
        const partes = [];
        for await (const ch of content) partes.push(ch);
        const mail = await simpleParser(Buffer.concat(partes));

        const data = cand.d.toISOString().slice(0, 10);
        console.log(`\nENCONTRADO  ${data}  ${pasta}`);
        console.log(`   de: ${cand.de}`);
        console.log(`   assunto: ${cand.assunto}`);

        fs.mkdirSync(DESTINO, { recursive: true });
        for (const anexo of mail.attachments ?? []) {
          const nome = `${data} ${(anexo.filename ?? "anexo").replace(/[^\w.\- ]/g, "_")}`;
          fs.writeFileSync(path.join(DESTINO, nome), anexo.content);
          console.log(`   salvo: ${DESTINO}/${nome}`);
        }
        if (!(mail.attachments ?? []).length) console.log("   (sem anexo — veja o corpo da mensagem no webmail)");

        achados.push({ data, pasta, de: cand.de, assunto: cand.assunto });
      } catch {
        console.log(`   (não consegui abrir a mensagem ${cand.uid} em ${pasta})`);
      }
    }

    await c.logout().catch(() => {});
  } catch (err) {
    console.error(`  ${pasta}: falhou (${err.message}) — sigo para a próxima pasta`);
    try { await c.close(); } catch { /* já caiu */ }
  }
}

console.log(`\n${varridas} mensagens varridas em ${pastas.length} pastas.`);
console.log(
  achados.length
    ? `${achados.length} encontrada(s). Anexos em ./${DESTINO}/`
    : "Nada encontrado com esses termos nesta caixa."
);
