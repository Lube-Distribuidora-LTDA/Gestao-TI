import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Move o cartão ou edita o texto dele.
 *
 * Mover manda `coluna_id` e `ordem`; editar manda os campos de texto. A mesma
 * rota serve aos dois porque arrastar é, do ponto de vista do banco, só mais
 * uma alteração do cartão.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!podeEscrever(await sessaoAtual())) {
    return NextResponse.json({ erro: "Seu perfil não permite alterações." }, { status: 403 });
  }

  const corpo = await req.json();
  const patch: Record<string, unknown> = {};

  if (corpo.coluna_id) patch.coluna_id = corpo.coluna_id;
  if (Number.isFinite(corpo.ordem)) patch.ordem = Number(corpo.ordem);
  if (typeof corpo.titulo === "string") {
    const t = corpo.titulo.trim();
    if (!t) return NextResponse.json({ erro: "O título não pode ficar vazio." }, { status: 400 });
    patch.titulo = t.slice(0, 200);
  }
  if ("descricao" in corpo) {
    patch.descricao = corpo.descricao ? String(corpo.descricao).trim().slice(0, 2000) : null;
  }
  if ("responsavel" in corpo) {
    patch.responsavel = corpo.responsavel ? String(corpo.responsavel).trim().slice(0, 120) : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ erro: "Nada para alterar." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await db.from("kanban_cartoes").update(patch).eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!podeEscrever(await sessaoAtual())) {
    return NextResponse.json({ erro: "Seu perfil não permite exclusões." }, { status: 403 });
  }

  const { error } = await supabaseAdmin().from("kanban_cartoes").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
