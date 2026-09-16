import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Arquivos anexados a uma nota avulsa. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { data, error } = await supabaseAdmin()
    .from("documentos")
    .select("id, nome_arquivo, tipo, tamanho_bytes, recebido_em, storage_path")
    .eq("nota_avulsa_id", id)
    .order("recebido_em", { ascending: false });

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ dados: data ?? [] });
}
