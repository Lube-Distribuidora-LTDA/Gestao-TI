import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Acompanhamento do chamado pelo solicitante, via token do link.
 *
 * O token é um UUID aleatório por chamado: quem tem o link vê aquele
 * chamado e só ele. Anotações internas da equipe nunca são devolvidas aqui.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ erro: "Link inválido." }, { status: 400 });
  }

  const db = supabaseAdmin();

  // string literal única: a tipagem do Supabase é inferida do texto do select
  const { data: chamado } = await db
    .from("chamados")
    .select("id, protocolo, titulo, descricao, categoria, prioridade, status, solicitante_nome, solicitante_setor, aberto_em, resolvido_em, solucao, responsavel, avaliacao")
    .eq("token_acesso", token)
    .maybeSingle();

  if (!chamado) return NextResponse.json({ erro: "Chamado não encontrado." }, { status: 404 });

  const { data: mensagens } = await db
    .from("chamado_mensagens")
    .select("id, autor, autor_nome, mensagem, criado_em")
    .eq("chamado_id", chamado.id)
    .eq("interna", false) // anotações internas ficam de fora
    .order("criado_em", { ascending: true });

  return NextResponse.json({ chamado, mensagens: mensagens ?? [] });
}

/** Resposta do solicitante ou avaliação do atendimento. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ erro: "Link inválido." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: chamado } = await db
    .from("chamados")
    .select("id, status, solicitante_nome")
    .eq("token_acesso", token)
    .maybeSingle();

  if (!chamado) return NextResponse.json({ erro: "Chamado não encontrado." }, { status: 404 });

  const corpo = await req.json();

  // --- avaliação ---
  if (corpo.avaliacao != null) {
    const nota = Number(corpo.avaliacao);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      return NextResponse.json({ erro: "Avaliação inválida." }, { status: 400 });
    }
    await db.from("chamados").update({ avaliacao: nota }).eq("id", chamado.id);
    return NextResponse.json({ ok: true });
  }

  // --- nova mensagem ---
  const mensagem = String(corpo.mensagem ?? "").trim();
  if (mensagem.length < 2) {
    return NextResponse.json({ erro: "Escreva sua mensagem." }, { status: 400 });
  }

  await db.from("chamado_mensagens").insert({
    chamado_id: chamado.id,
    autor: "solicitante",
    autor_nome: chamado.solicitante_nome,
    mensagem: mensagem.slice(0, 5000),
  });

  // responder reabre um chamado que estava esperando o usuário ou resolvido
  if (["aguardando_usuario", "resolvido"].includes(chamado.status)) {
    await db
      .from("chamados")
      .update({ status: "em_atendimento", resolvido_em: null })
      .eq("id", chamado.id);
  }

  return NextResponse.json({ ok: true });
}
