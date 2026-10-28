import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Base de conhecimento para o portal de chamados — sem o login do app, como a abertura de
 * chamado (a Sentinela já exigiu o login do Painel Lube antes de chegar aqui).
 *
 * Só sai artigo publicado, e só os campos de leitura: rascunho, contadores e autor ficam na
 * aba da TI.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("base_conhecimento")
    .select("id, titulo, categoria, conteudo, palavras_chave")
    .eq("publicado", true)
    .order("titulo");
  if (error) return NextResponse.json({ erro: "Não foi possível carregar os artigos." }, { status: 400 });
  return NextResponse.json({ artigos: data ?? [] });
}

/**
 * Conta que o artigo foi aberto (`resolveu: false`) ou que resolveu o problema
 * (`resolveu: true`). É o número que diz quais artigos estão poupando chamado.
 */
export async function POST(req: Request) {
  try {
    const { id, resolveu } = await req.json();
    if (!/^[0-9a-f-]{36}$/i.test(String(id ?? ""))) {
      return NextResponse.json({ erro: "Artigo inválido." }, { status: 400 });
    }
    await supabaseAdmin().rpc("contar_base_conhecimento", { p_id: id, p_resolveu: resolveu === true });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }
}
