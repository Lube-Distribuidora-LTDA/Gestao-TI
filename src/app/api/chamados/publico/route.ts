import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { enviarEmail } from "@/lib/mailer";
import { emailChamadoAberto, emailNovoChamadoParaTI } from "@/lib/templates";
import { PRIORIDADE, type PrioridadeChamado } from "@/lib/tipos";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Abertura de chamado pelo portal — rota pública, sem login.
 *
 * Por ser pública, ela é deliberadamente restrita: aceita só os campos do
 * formulário, limita tamanho, valida o e-mail e nunca devolve dados de
 * outros chamados.
 */
export async function POST(req: Request) {
  try {
    const corpo = await req.json();

    const nome = String(corpo.solicitante_nome ?? "").trim();
    const email = String(corpo.solicitante_email ?? "").trim().toLowerCase();
    const titulo = String(corpo.titulo ?? "").trim();
    const descricao = String(corpo.descricao ?? "").trim();

    if (nome.length < 3) {
      return NextResponse.json({ erro: "Informe seu nome completo." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ erro: "Informe um e-mail válido." }, { status: 400 });
    }
    if (titulo.length < 5) {
      return NextResponse.json({ erro: "Descreva o problema em poucas palavras no título." }, { status: 400 });
    }
    if (descricao.length < 10) {
      return NextResponse.json({ erro: "Detalhe um pouco mais o que está acontecendo." }, { status: 400 });
    }

    const prioridade = (["baixa", "media", "alta", "critica"] as const).includes(corpo.prioridade)
      ? (corpo.prioridade as PrioridadeChamado)
      : "media";

    const db = supabaseAdmin();

    const { data: chamado, error } = await db
      .from("chamados")
      .insert({
        solicitante_nome: nome.slice(0, 120),
        solicitante_email: email.slice(0, 160),
        solicitante_setor: String(corpo.solicitante_setor ?? "").slice(0, 60) || null,
        solicitante_ramal: String(corpo.solicitante_ramal ?? "").slice(0, 20) || null,
        categoria: String(corpo.categoria ?? "Outros").slice(0, 60),
        titulo: titulo.slice(0, 180),
        descricao: descricao.slice(0, 5000),
        equipamento: String(corpo.equipamento ?? "").slice(0, 120) || null,
        localizacao: String(corpo.localizacao ?? "").slice(0, 120) || null,
        prioridade,
      })
      .select("id, protocolo, token_acesso, titulo, categoria, prioridade")
      .single();

    if (error || !chamado) {
      return NextResponse.json(
        { erro: "Não foi possível registrar o chamado. Tente novamente." },
        { status: 400 }
      );
    }

    // primeira mensagem da thread = a própria descrição
    await db.from("chamado_mensagens").insert({
      chamado_id: chamado.id,
      autor: "solicitante",
      autor_nome: nome,
      mensagem: descricao,
    });

    const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const link = `${base}/acompanhar/${chamado.token_acesso}`;

    // confirmação para quem abriu — falha de e-mail não invalida o chamado
    try {
      const msg = emailChamadoAberto({
        protocolo: chamado.protocolo,
        nome,
        titulo: chamado.titulo,
        categoria: chamado.categoria,
        prioridade: PRIORIDADE[prioridade].label,
        linkAcompanhamento: link,
      });
      await enviarEmail({ para: email, assunto: msg.assunto, html: msg.html });
    } catch {
      /* segue o jogo */
    }

    // aviso para a equipe de TI
    const avisoTI = process.env.TI_EMAIL_AVISOS;
    if (avisoTI) {
      try {
        const msg = emailNovoChamadoParaTI({
          protocolo: chamado.protocolo,
          solicitante: nome,
          setor: String(corpo.solicitante_setor ?? "—"),
          titulo: chamado.titulo,
          descricao,
          prioridade: PRIORIDADE[prioridade].label,
          categoria: chamado.categoria,
          linkPainel: `${base}/chamados/${chamado.id}`,
        });
        await enviarEmail({ para: avisoTI, assunto: msg.assunto, html: msg.html, responderPara: email });
      } catch {
        /* segue o jogo */
      }
    }

    return NextResponse.json({
      ok: true,
      protocolo: chamado.protocolo,
      token: chamado.token_acesso,
    });
  } catch {
    return NextResponse.json({ erro: "Erro inesperado ao registrar o chamado." }, { status: 500 });
  }
}
