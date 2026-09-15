import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";
import { enviarEmail } from "@/lib/mailer";
import { emailChamadoResposta } from "@/lib/templates";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = supabaseAdmin();

  const [{ data: chamado }, { data: mensagens }] = await Promise.all([
    db.from("chamados").select("*").eq("id", id).maybeSingle(),
    db.from("chamado_mensagens").select("*").eq("chamado_id", id).order("criado_em"),
  ]);

  if (!chamado) return NextResponse.json({ erro: "Chamado não encontrado." }, { status: 404 });
  return NextResponse.json({ chamado, mensagens: mensagens ?? [] });
}

const CAMPOS = ["status", "prioridade", "responsavel", "categoria", "solucao", "equipamento", "localizacao"];

/** Atualiza situação/atribuição do chamado. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sessao = await sessaoAtual();

  if (!podeEscrever(sessao)) {
    return NextResponse.json({ erro: "Seu perfil não permite alterações." }, { status: 403 });
  }

  const corpo = await req.json();
  const patch: Record<string, unknown> = {};
  for (const c of CAMPOS) if (corpo[c] !== undefined) patch[c] = corpo[c];

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ erro: "Nenhum campo válido enviado." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const agora = new Date().toISOString();

  if (patch.status === "resolvido") patch.resolvido_em = agora;
  if (patch.status === "fechado") patch.fechado_em = agora;
  if (patch.status === "em_atendimento") {
    const { data: atual } = await db
      .from("chamados")
      .select("primeira_resposta_em")
      .eq("id", id)
      .maybeSingle();
    if (!atual?.primeira_resposta_em) patch.primeira_resposta_em = agora;
    if (!patch.responsavel && sessao?.nome) patch.responsavel = sessao.nome;
  }

  const { data, error } = await db.from("chamados").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  // avisa o solicitante quando o chamado é resolvido
  if (patch.status === "resolvido" && data) {
    await notificar(data, corpo.solucao || "Chamado resolvido pela equipe de TI.", sessao?.nome ?? "Equipe de TI", true);
  }

  return NextResponse.json({ dados: data });
}

/** Responde ao solicitante (ou registra anotação interna). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sessao = await sessaoAtual();

  if (!podeEscrever(sessao)) {
    return NextResponse.json({ erro: "Seu perfil não permite responder chamados." }, { status: 403 });
  }

  const { mensagem, interna } = await req.json();
  const texto = String(mensagem ?? "").trim();

  if (texto.length < 2) {
    return NextResponse.json({ erro: "Escreva a mensagem." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: chamado } = await db.from("chamados").select("*").eq("id", id).maybeSingle();
  if (!chamado) return NextResponse.json({ erro: "Chamado não encontrado." }, { status: 404 });

  await db.from("chamado_mensagens").insert({
    chamado_id: id,
    autor: "tecnico",
    autor_nome: sessao?.nome ?? "Equipe de TI",
    mensagem: texto.slice(0, 5000),
    interna: !!interna,
    notificado: !interna,
  });

  const patch: Record<string, unknown> = {};
  if (!chamado.primeira_resposta_em && !interna) {
    patch.primeira_resposta_em = new Date().toISOString();
  }
  if (chamado.status === "aberto" && !interna) {
    patch.status = "em_atendimento";
    if (!chamado.responsavel && sessao?.nome) patch.responsavel = sessao.nome;
  }
  if (Object.keys(patch).length > 0) {
    await db.from("chamados").update(patch).eq("id", id);
  }

  // anotação interna não sai por e-mail
  let emailEnviado = false;
  if (!interna) {
    emailEnviado = await notificar(chamado, texto, sessao?.nome ?? "Equipe de TI", false);
  }

  return NextResponse.json({ ok: true, emailEnviado });
}

async function notificar(
  chamado: Record<string, unknown>,
  texto: string,
  autor: string,
  resolvido: boolean
): Promise<boolean> {
  try {
    const db = supabaseAdmin();
    const { data: cfg } = await db
      .from("configuracoes")
      .select("valor")
      .eq("chave", "notificar_chamado_email")
      .maybeSingle();

    if (cfg?.valor === "false") return false;

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const msg = emailChamadoResposta({
      protocolo: String(chamado.protocolo),
      nome: String(chamado.solicitante_nome),
      titulo: String(chamado.titulo),
      mensagem: texto,
      autorNome: autor,
      linkAcompanhamento: `${base}/acompanhar/${chamado.token_acesso}`,
      resolvido,
    });

    const r = await enviarEmail({
      para: String(chamado.solicitante_email),
      assunto: msg.assunto,
      html: msg.html,
    });
    return r.ok;
  } catch {
    return false;
  }
}
