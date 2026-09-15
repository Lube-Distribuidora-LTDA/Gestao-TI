import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recupera o link de acompanhamento a partir de protocolo + e-mail.
 *
 * Exigir os dois campos evita que alguém descubra chamados alheios só
 * chutando números de protocolo.
 */
export async function POST(req: Request) {
  const { protocolo, email } = await req.json();

  const p = String(protocolo ?? "").trim().toUpperCase();
  const e = String(email ?? "").trim().toLowerCase();

  if (!p || !e) {
    return NextResponse.json({ erro: "Informe o protocolo e o e-mail usado na abertura." }, { status: 400 });
  }

  const { data } = await supabaseAdmin()
    .from("chamados")
    .select("token_acesso")
    .eq("protocolo", p)
    .eq("solicitante_email", e)
    .maybeSingle();

  if (!data) {
    // mensagem única para não revelar qual dos dois campos está errado
    return NextResponse.json(
      { erro: "Não encontramos um chamado com esse protocolo e e-mail." },
      { status: 404 }
    );
  }

  return NextResponse.json({ token: data.token_acesso });
}
