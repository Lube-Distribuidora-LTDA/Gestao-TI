import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";
import { lerArtigo } from "@/lib/conhecimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Edita o artigo inteiro (o formulário manda todos os campos). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!podeEscrever(await sessaoAtual())) {
    return NextResponse.json({ erro: "Seu perfil não permite alterações." }, { status: 403 });
  }

  const lido = lerArtigo(await req.json());
  if ("erro" in lido) return NextResponse.json({ erro: lido.erro }, { status: 400 });

  const { error } = await supabaseAdmin().from("base_conhecimento").update(lido.dados).eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!podeEscrever(await sessaoAtual())) {
    return NextResponse.json({ erro: "Seu perfil não permite exclusões." }, { status: 403 });
  }

  const { error } = await supabaseAdmin().from("base_conhecimento").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
