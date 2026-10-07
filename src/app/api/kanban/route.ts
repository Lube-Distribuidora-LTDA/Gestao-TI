import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Colunas e cartões do quadro, numa chamada só — a tela precisa dos dois juntos. */
export async function GET() {
  const db = supabaseAdmin();

  const [{ data: colunas, error: e1 }, { data: cartoes, error: e2 }] = await Promise.all([
    db.from("kanban_colunas").select("*").order("ordem"),
    db.from("kanban_cartoes").select("*").order("ordem"),
  ]);

  const erro = e1 ?? e2;
  if (erro) return NextResponse.json({ erro: erro.message }, { status: 400 });

  return NextResponse.json({ colunas: colunas ?? [], cartoes: cartoes ?? [] });
}

/** Cria um cartão no fim da coluna escolhida. */
export async function POST(req: Request) {
  if (!podeEscrever(await sessaoAtual())) {
    return NextResponse.json({ erro: "Seu perfil não permite alterações." }, { status: 403 });
  }

  const { coluna_id, titulo, descricao, responsavel } = await req.json();

  if (!coluna_id || !String(titulo ?? "").trim()) {
    return NextResponse.json({ erro: "Informe a coluna e o título do cartão." }, { status: 400 });
  }

  const db = supabaseAdmin();

  /* Entra no fim da coluna. Sem isso o cartão novo nasceria na ordem 0 e
     empurraria para baixo o que já estava organizado. */
  const { data: ultimo } = await db
    .from("kanban_cartoes")
    .select("ordem")
    .eq("coluna_id", coluna_id)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db
    .from("kanban_cartoes")
    .insert({
      coluna_id,
      titulo: String(titulo).trim().slice(0, 200),
      descricao: descricao ? String(descricao).trim().slice(0, 2000) : null,
      responsavel: responsavel ? String(responsavel).trim().slice(0, 120) : null,
      ordem: (ultimo?.ordem ?? -1) + 1,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ cartao: data });
}
