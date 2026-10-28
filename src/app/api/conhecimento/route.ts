import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";
import { lerArtigo } from "@/lib/conhecimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Todos os artigos, rascunhos inclusive — é a lista da aba da TI. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("base_conhecimento")
    .select("*")
    .order("categoria")
    .order("titulo");
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ artigos: data ?? [] });
}

export async function POST(req: Request) {
  const sessao = await sessaoAtual();
  if (!podeEscrever(sessao)) {
    return NextResponse.json({ erro: "Seu perfil não permite alterações." }, { status: 403 });
  }

  const lido = lerArtigo(await req.json());
  if ("erro" in lido) return NextResponse.json({ erro: lido.erro }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("base_conhecimento")
    .insert({ ...lido.dados, criado_por: sessao?.nome ?? null })
    .select("*")
    .single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ artigo: data });
}
