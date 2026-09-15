import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista faturas com todos os filtros da tela. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const db = supabaseAdmin();

  let q = db.from("vw_faturas_detalhe").select("*");

  const competencia = url.searchParams.get("competencia");
  const status = url.searchParams.get("status");
  const fornecedor = url.searchParams.get("fornecedor");
  const categoria = url.searchParams.get("categoria");
  const filtro = url.searchParams.get("filtro");
  const busca = url.searchParams.get("busca");

  if (competencia) q = q.eq("competencia", competencia);
  if (status) q = q.eq("status", status);
  if (fornecedor) q = q.eq("fornecedor_id", fornecedor);
  if (categoria) q = q.eq("categoria_id", categoria);
  if (filtro === "vencidas") q = q.eq("vencida", true);
  if (filtro === "revisao") q = q.eq("precisa_revisao", true);
  if (busca) {
    const termo = busca.replace(/[%,()]/g, "");
    q = q.or(`fornecedor_nome.ilike.%${termo}%,conta_descricao.ilike.%${termo}%`);
  }

  const { data, error } = await q.order("vencimento", { ascending: true });
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({ dados: data ?? [] });
}

/** Gera as faturas de uma competência a partir das contas ativas. */
export async function POST(req: Request) {
  if (!podeEscrever(await sessaoAtual())) {
    return NextResponse.json({ erro: "Seu perfil não permite esta ação." }, { status: 403 });
  }

  const { competencia } = await req.json();
  const db = supabaseAdmin();

  const { data, error } = await db.rpc("gerar_faturas_competencia", {
    p_competencia: competencia ?? null,
  });

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  const r = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    criadas: r?.criadas ?? 0,
    existentes: r?.existentes ?? 0,
  });
}
