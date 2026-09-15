import { NextResponse } from "next/server";
import { supabaseAdmin, BUCKET_DOCUMENTOS } from "@/lib/supabase";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Link temporário para abrir/imprimir o documento. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = supabaseAdmin();

  const { data: doc } = await db
    .from("documentos")
    .select("storage_path, nome_arquivo")
    .eq("id", id)
    .maybeSingle();

  if (!doc?.storage_path) {
    return NextResponse.json({ erro: "Documento sem arquivo armazenado." }, { status: 404 });
  }

  // 5 minutos é suficiente para abrir/imprimir e curto o bastante para não virar link público
  const { data, error } = await db.storage
    .from(BUCKET_DOCUMENTOS)
    .createSignedUrl(doc.storage_path, 300);

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({ url: data.signedUrl, nome: doc.nome_arquivo });
}

/** Confirma a classificação que o robô marcou como duvidosa. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sessao = await sessaoAtual();

  if (!podeEscrever(sessao)) {
    return NextResponse.json({ erro: "Seu perfil não permite alterações." }, { status: 403 });
  }

  const { tipo } = await req.json();
  const tiposValidos = ["nota_fiscal", "fatura", "boleto", "contrato", "outro"];
  if (!tiposValidos.includes(tipo)) {
    return NextResponse.json({ erro: "Tipo de documento inválido." }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: doc, error } = await db
    .from("documentos")
    .update({
      tipo,
      confianca: "alta",
      confirmado_em: new Date().toISOString(),
      confirmado_por: sessao?.nome ?? null,
    })
    .eq("id", id)
    .select("fatura_id")
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  // ao confirmar o tipo, a fatura recebe a marcação correspondente
  if (doc?.fatura_id) {
    const agora = new Date().toISOString();
    const patch: Record<string, unknown> = { precisa_revisao: false };
    if (tipo === "nota_fiscal") patch.nota_fiscal_recebida_em = agora;
    if (tipo === "fatura" || tipo === "boleto") patch.fatura_recebida_em = agora;
    await db.from("faturas").update(patch).eq("id", doc.fatura_id);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!podeEscrever(await sessaoAtual())) {
    return NextResponse.json({ erro: "Seu perfil não permite exclusões." }, { status: 403 });
  }

  const db = supabaseAdmin();
  const { data: doc } = await db.from("documentos").select("storage_path").eq("id", id).maybeSingle();

  if (doc?.storage_path) {
    await db.storage.from(BUCKET_DOCUMENTOS).remove([doc.storage_path]);
  }
  await db.from("documentos").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
