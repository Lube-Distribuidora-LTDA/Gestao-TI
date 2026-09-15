import { esc } from "./mailer";
import { moeda, data, competenciaExtenso } from "./format";

/** Layout base dos e-mails, com a identidade da Lube. */
function layout(conteudo: string, rodapeExtra?: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef1f8;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f8;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;
                    box-shadow:0 6px 28px rgba(14,23,66,.16);">

        <!-- cabeçalho -->
        <tr><td style="background:linear-gradient(135deg,#1e2f8f 0%,#0e1742 100%);padding:26px 32px;">
          <table role="presentation" width="100%"><tr>
            <td style="color:#fff;font-size:23px;font-weight:800;letter-spacing:.4px;">
              LUBE <span style="color:#ff6b70;font-weight:800;">DISTRIBUIDORA</span>
            </td>
            <td align="right" style="color:#a9b8ff;font-size:11px;font-weight:700;
                                     text-transform:uppercase;letter-spacing:1.4px;">
              Departamento de TI
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="height:4px;background:linear-gradient(90deg,#1e2f8f,#ee1c25);"></td></tr>

        <!-- corpo -->
        <tr><td style="padding:32px;color:#1c2439;font-size:15px;line-height:1.65;">
          ${conteudo}
        </td></tr>

        <!-- rodapé -->
        <tr><td style="background:#f5f7fc;border-top:1px solid #e2e7f3;padding:20px 32px;
                       color:#6b7690;font-size:12px;line-height:1.6;">
          ${rodapeExtra ? `<div style="margin-bottom:10px;">${rodapeExtra}</div>` : ""}
          <strong style="color:#1e2f8f;">Lube Distribuidora</strong> &middot; Departamento de Tecnologia da Informação<br>
          Esta é uma mensagem automática do sistema de Gestão de TI. Em caso de dúvida, basta responder a este e-mail.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const BOTAO = (href: string, texto: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
    <tr><td style="background:linear-gradient(135deg,#2f3cc4,#1e2f8f);border-radius:10px;">
      <a href="${href}" style="display:inline-block;padding:13px 28px;color:#fff;text-decoration:none;
                               font-weight:700;font-size:14px;">${texto}</a>
    </td></tr>
  </table>`;

/* ============================================================
   COBRANÇA DE NOTA FISCAL / FATURA
   ============================================================ */

export type DadosCobranca = {
  fornecedorNome: string;
  contatoNome?: string | null;
  contaDescricao: string;
  identificador?: string | null;
  competencia: string;
  vencimento: string;
  valorPrevisto: number;
  faltantes: string[];
  tentativa: number;
  emailTI: string;
};

export function emailCobranca(d: DadosCobranca): { assunto: string; html: string } {
  const faltam = d.faltantes.join(" e ");
  const comp = competenciaExtenso(d.competencia);
  const venceEm = Math.ceil(
    (new Date(d.vencimento + "T00:00:00").getTime() - Date.now()) / 86_400_000
  );
  const vencida = venceEm < 0;

  // O tom sobe a cada tentativa, mas continua formal em todas.
  let saudacao: string;
  let corpo: string;
  let assunto: string;
  let faixa = "#2f3cc4";
  let faixaTexto = "Solicitação de documentos";

  if (d.tentativa <= 1) {
    assunto = `Solicitação de ${faltam} — ${d.contaDescricao} — ${comp}`;
    saudacao = "Prezados, bom dia.";
    corpo = `Solicitamos o envio da <strong>${esc(faltam)}</strong> referente à competência de
             <strong>${esc(comp)}</strong>, para que possamos dar seguimento ao processo interno de
             conferência e pagamento dentro do prazo.`;
  } else if (d.tentativa === 2) {
    assunto = `[Reiteração] Pendência de ${faltam} — ${d.contaDescricao} — ${comp}`;
    saudacao = "Prezados,";
    faixa = "#d97706";
    faixaTexto = "Segunda solicitação";
    corpo = `Reiteramos nossa solicitação anterior referente ao envio da
             <strong>${esc(faltam)}</strong> da competência de <strong>${esc(comp)}</strong>.
             Até o momento não identificamos o recebimento do documento em nossa caixa de entrada.
             Pedimos a gentileza de nos encaminhar com brevidade.`;
  } else {
    assunto = `[URGENTE] Pendência de ${faltam} — ${d.contaDescricao} — ${comp}`;
    saudacao = "Prezados,";
    faixa = "#ee1c25";
    faixaTexto = vencida ? "Documento em atraso" : "Vencimento próximo";
    corpo = `Esta é nossa <strong>${d.tentativa}ª solicitação</strong> referente ao envio da
             <strong>${esc(faltam)}</strong> da competência de <strong>${esc(comp)}</strong>.
             ${
               vencida
                 ? `O vencimento ocorreu em <strong>${data(d.vencimento)}</strong> e a ausência do documento
                    <strong>impede a liquidação do título</strong>, podendo acarretar atraso no pagamento.`
                 : `O vencimento está previsto para <strong>${data(d.vencimento)}</strong> e a ausência do
                    documento <strong>impede a programação do pagamento</strong>.`
             }
             Solicitamos tratativa <strong>com urgência</strong>.`;
  }

  const linhas: Array<[string, string]> = [
    ["Fornecedor", esc(d.fornecedorNome)],
    ["Serviço / Contrato", esc(d.contaDescricao)],
  ];
  if (d.identificador) linhas.push(["Identificador", esc(d.identificador)]);
  linhas.push(["Competência", esc(comp)]);
  linhas.push([
    "Vencimento",
    `${data(d.vencimento)} ${
      vencida
        ? `<span style="color:#ee1c25;font-weight:700;">(vencido há ${Math.abs(venceEm)} dia${Math.abs(venceEm) === 1 ? "" : "s"})</span>`
        : venceEm <= 5
          ? `<span style="color:#d97706;font-weight:700;">(em ${venceEm} dia${venceEm === 1 ? "" : "s"})</span>`
          : ""
    }`,
  ]);
  if (d.valorPrevisto > 0) linhas.push(["Valor previsto", moeda(d.valorPrevisto)]);
  linhas.push([
    "Pendente",
    `<span style="color:#ee1c25;font-weight:700;text-transform:uppercase;">${esc(faltam)}</span>`,
  ]);

  const tabela = linhas
    .map(
      ([k, v], i) => `
      <tr style="background:${i % 2 ? "#f7f9fd" : "#ffffff"};">
        <td style="padding:10px 14px;color:#6b7690;font-size:13px;font-weight:600;
                   width:38%;border-bottom:1px solid #e8ecf6;">${k}</td>
        <td style="padding:10px 14px;color:#1c2439;font-size:13px;font-weight:600;
                   border-bottom:1px solid #e8ecf6;">${v}</td>
      </tr>`
    )
    .join("");

  const html = layout(`
    <div style="display:inline-block;background:${faixa};color:#fff;font-size:11px;font-weight:800;
                text-transform:uppercase;letter-spacing:1px;padding:5px 12px;border-radius:20px;
                margin-bottom:18px;">${faixaTexto}</div>

    <p style="margin:0 0 14px;">${saudacao}</p>
    <p style="margin:0 0 20px;">${corpo}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e8ecf6;border-radius:10px;overflow:hidden;margin:20px 0;">
      ${tabela}
    </table>

    <p style="margin:18px 0 0;">
      O documento pode ser enviado como resposta a este e-mail ou diretamente para
      <a href="mailto:${esc(d.emailTI)}" style="color:#1e2f8f;font-weight:600;">${esc(d.emailTI)}</a>.
      Nosso sistema identifica o anexo automaticamente e baixa a pendência.
    </p>

    <p style="margin:22px 0 0;">
      Caso o documento já tenha sido enviado nas últimas horas, favor desconsiderar esta mensagem.
    </p>

    <p style="margin:26px 0 0;color:#3a4460;">
      Atenciosamente,<br>
      <strong style="color:#1e2f8f;">Departamento de Tecnologia da Informação</strong><br>
      Lube Distribuidora
    </p>
  `);

  return { assunto, html };
}

/* ============================================================
   CHAMADOS
   ============================================================ */

export function emailChamadoAberto(d: {
  protocolo: string;
  nome: string;
  titulo: string;
  categoria: string;
  prioridade: string;
  linkAcompanhamento: string;
}): { assunto: string; html: string } {
  return {
    assunto: `[${d.protocolo}] Chamado registrado — ${d.titulo}`,
    html: layout(`
      <div style="display:inline-block;background:#059669;color:#fff;font-size:11px;font-weight:800;
                  text-transform:uppercase;letter-spacing:1px;padding:5px 12px;border-radius:20px;
                  margin-bottom:18px;">Chamado registrado</div>

      <p style="margin:0 0 14px;">Olá, <strong>${esc(d.nome)}</strong>!</p>
      <p style="margin:0 0 18px;">
        Recebemos sua solicitação e ela já está na fila do time de TI.
        Guarde o número do protocolo para acompanhamento:
      </p>

      <div style="background:linear-gradient(135deg,#1e2f8f,#0e1742);border-radius:12px;
                  padding:22px;text-align:center;margin:20px 0;">
        <div style="color:#a9b8ff;font-size:11px;font-weight:700;text-transform:uppercase;
                    letter-spacing:1.5px;margin-bottom:6px;">Protocolo</div>
        <div style="color:#fff;font-size:28px;font-weight:800;letter-spacing:1.5px;">${esc(d.protocolo)}</div>
      </div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #e8ecf6;border-radius:10px;overflow:hidden;margin:18px 0;">
        <tr style="background:#ffffff;">
          <td style="padding:10px 14px;color:#6b7690;font-size:13px;font-weight:600;width:34%;
                     border-bottom:1px solid #e8ecf6;">Assunto</td>
          <td style="padding:10px 14px;color:#1c2439;font-size:13px;font-weight:600;
                     border-bottom:1px solid #e8ecf6;">${esc(d.titulo)}</td>
        </tr>
        <tr style="background:#f7f9fd;">
          <td style="padding:10px 14px;color:#6b7690;font-size:13px;font-weight:600;
                     border-bottom:1px solid #e8ecf6;">Categoria</td>
          <td style="padding:10px 14px;color:#1c2439;font-size:13px;font-weight:600;
                     border-bottom:1px solid #e8ecf6;">${esc(d.categoria)}</td>
        </tr>
        <tr style="background:#ffffff;">
          <td style="padding:10px 14px;color:#6b7690;font-size:13px;font-weight:600;">Prioridade</td>
          <td style="padding:10px 14px;color:#1c2439;font-size:13px;font-weight:600;">${esc(d.prioridade)}</td>
        </tr>
      </table>

      ${BOTAO(d.linkAcompanhamento, "Acompanhar meu chamado")}

      <p style="margin:16px 0 0;color:#6b7690;font-size:13px;">
        Pelo link acima você acompanha o andamento e conversa com a equipe sem precisar de senha.
      </p>
    `),
  };
}

export function emailChamadoResposta(d: {
  protocolo: string;
  nome: string;
  titulo: string;
  mensagem: string;
  autorNome: string;
  linkAcompanhamento: string;
  resolvido: boolean;
}): { assunto: string; html: string } {
  const msgHtml = esc(d.mensagem).replace(/\n/g, "<br>");

  return {
    assunto: d.resolvido
      ? `[${d.protocolo}] Chamado resolvido — ${d.titulo}`
      : `[${d.protocolo}] Nova resposta — ${d.titulo}`,
    html: layout(`
      <div style="display:inline-block;background:${d.resolvido ? "#059669" : "#2f3cc4"};color:#fff;
                  font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;
                  padding:5px 12px;border-radius:20px;margin-bottom:18px;">
        ${d.resolvido ? "Chamado resolvido" : "Nova resposta da TI"}
      </div>

      <p style="margin:0 0 14px;">Olá, <strong>${esc(d.nome)}</strong>!</p>
      <p style="margin:0 0 18px;">
        ${
          d.resolvido
            ? `Seu chamado <strong>${esc(d.protocolo)}</strong> foi marcado como resolvido pela equipe de TI.`
            : `A equipe de TI respondeu seu chamado <strong>${esc(d.protocolo)}</strong>:`
        }
      </p>

      <div style="background:#f5f7fc;border-left:4px solid #1e2f8f;border-radius:0 10px 10px 0;
                  padding:16px 18px;margin:18px 0;">
        <div style="color:#6b7690;font-size:11px;font-weight:700;text-transform:uppercase;
                    letter-spacing:1px;margin-bottom:8px;">${esc(d.autorNome)}</div>
        <div style="color:#1c2439;font-size:14px;line-height:1.6;">${msgHtml}</div>
      </div>

      ${BOTAO(d.linkAcompanhamento, d.resolvido ? "Ver chamado e avaliar" : "Responder à TI")}

      <p style="margin:16px 0 0;color:#6b7690;font-size:13px;">
        ${
          d.resolvido
            ? "Se o problema persistir, é só reabrir o chamado pelo link acima."
            : "Você pode responder diretamente pelo link acima."
        }
      </p>
    `),
  };
}

/** Aviso interno para a TI quando um chamado novo entra. */
export function emailNovoChamadoParaTI(d: {
  protocolo: string;
  solicitante: string;
  setor: string;
  titulo: string;
  descricao: string;
  prioridade: string;
  categoria: string;
  linkPainel: string;
}): { assunto: string; html: string } {
  const cor = d.prioridade === "Crítica" ? "#ee1c25" : d.prioridade === "Alta" ? "#d97706" : "#2f3cc4";
  return {
    assunto: `[${d.protocolo}] Novo chamado (${d.prioridade}) — ${d.titulo}`,
    html: layout(`
      <div style="display:inline-block;background:${cor};color:#fff;font-size:11px;font-weight:800;
                  text-transform:uppercase;letter-spacing:1px;padding:5px 12px;border-radius:20px;
                  margin-bottom:18px;">Novo chamado · ${esc(d.prioridade)}</div>

      <p style="margin:0 0 16px;font-size:17px;font-weight:700;color:#1e2f8f;">${esc(d.titulo)}</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #e8ecf6;border-radius:10px;overflow:hidden;margin:16px 0;">
        <tr style="background:#ffffff;">
          <td style="padding:10px 14px;color:#6b7690;font-size:13px;font-weight:600;width:34%;
                     border-bottom:1px solid #e8ecf6;">Protocolo</td>
          <td style="padding:10px 14px;color:#1c2439;font-size:13px;font-weight:700;
                     border-bottom:1px solid #e8ecf6;">${esc(d.protocolo)}</td>
        </tr>
        <tr style="background:#f7f9fd;">
          <td style="padding:10px 14px;color:#6b7690;font-size:13px;font-weight:600;
                     border-bottom:1px solid #e8ecf6;">Solicitante</td>
          <td style="padding:10px 14px;color:#1c2439;font-size:13px;font-weight:600;
                     border-bottom:1px solid #e8ecf6;">${esc(d.solicitante)} — ${esc(d.setor)}</td>
        </tr>
        <tr style="background:#ffffff;">
          <td style="padding:10px 14px;color:#6b7690;font-size:13px;font-weight:600;">Categoria</td>
          <td style="padding:10px 14px;color:#1c2439;font-size:13px;font-weight:600;">${esc(d.categoria)}</td>
        </tr>
      </table>

      <div style="background:#f5f7fc;border-left:4px solid ${cor};border-radius:0 10px 10px 0;
                  padding:16px 18px;margin:16px 0;color:#1c2439;font-size:14px;line-height:1.6;">
        ${esc(d.descricao).replace(/\n/g, "<br>")}
      </div>

      ${BOTAO(d.linkPainel, "Abrir no painel de TI")}
    `),
  };
}
