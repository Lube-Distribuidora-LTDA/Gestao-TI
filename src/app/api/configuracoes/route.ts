import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sessaoAtual } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data } = await supabaseAdmin().from("configuracoes").select("*").order("chave");
  return NextResponse.json({ dados: data ?? [] });
}

export async function PATCH(req: Request) {
  const sessao = await sessaoAtual();
  if (sessao?.papel !== "admin") {
    return NextResponse.json(
      { erro: "Apenas administradores alteram as configurações." },
      { status: 403 }
    );
  }

  const corpo = (await req.json()) as Record<string, string>;
  const db = supabaseAdmin();

  const linhas = Object.entries(corpo).map(([chave, valor]) => ({
    chave,
    valor: String(valor ?? ""),
    atualizado_em: new Date().toISOString(),
  }));

  if (linhas.length === 0) {
    return NextResponse.json({ erro: "Nada para salvar." }, { status: 400 });
  }

  const { error } = await db.from("configuracoes").upsert(linhas, { onConflict: "chave" });
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
