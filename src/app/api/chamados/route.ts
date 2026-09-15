import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista de chamados do painel de atendimento. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const db = supabaseAdmin();

  let q = db.from("chamados").select("*");

  const status = url.searchParams.get("status");
  const prioridade = url.searchParams.get("prioridade");
  const busca = url.searchParams.get("busca");

  if (status === "ativos") q = q.not("status", "in", "(fechado,cancelado)");
  else if (status) q = q.eq("status", status);

  if (prioridade) q = q.eq("prioridade", prioridade);

  if (busca) {
    const termo = busca.replace(/[%,()]/g, "");
    q = q.or(
      `protocolo.ilike.%${termo}%,titulo.ilike.%${termo}%,solicitante_nome.ilike.%${termo}%,solicitante_email.ilike.%${termo}%`
    );
  }

  const { data, error } = await q.order("aberto_em", { ascending: false }).limit(300);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({ dados: data ?? [] });
}
