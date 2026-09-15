import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Detalhe da fatura com seus documentos e histórico de cobrança. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = supabaseAdmin();

  const [{ data: fatura }, { data: documentos }, { data: cobrancas }] = await Promise.all([
    db.from("vw_faturas_detalhe").select("*").eq("id", id).maybeSingle(),
    db.from("documentos").select("*").eq("fatura_id", id).order("recebido_em", { ascending: false }),
    db.from("cobrancas").select("id, tentativa, destinatario, assunto, status, enviada_em, erro, automatica")
      .eq("fatura_id", id).order("criado_em", { ascending: false }),
  ]);

  if (!fatura) return NextResponse.json({ erro: "Fatura não encontrada." }, { status: 404 });

  return NextResponse.json({ fatura, documentos: documentos ?? [], cobrancas: cobrancas ?? [] });
}

const CAMPOS_EDITAVEIS = [
  "valor_real", "status", "pago_em", "numero_nota", "numero_documento",
  "observacoes", "vencimento", "precisa_revisao",
  "nota_fiscal_recebida_em", "fatura_recebida_em",
];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!podeEscrever(await sessaoAtual())) {
    return NextResponse.json({ erro: "Seu perfil não permite alterações." }, { status: 403 });
  }

  const corpo = await req.json();
  const patch: Record<string, unknown> = {};
  for (const c of CAMPOS_EDITAVEIS) if (corpo[c] !== undefined) patch[c] = corpo[c];

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ erro: "Nenhum campo válido enviado." }, { status: 400 });
  }

  // marcar como paga sem data informada: assume hoje
  if (patch.status === "paga" && !patch.pago_em) {
    patch.pago_em = new Date().toISOString().slice(0, 10);
  }

  const { data, error } = await supabaseAdmin()
    .from("faturas")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ dados: data });
}
