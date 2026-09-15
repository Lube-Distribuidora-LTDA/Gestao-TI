import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { TABELAS, filtrarCampos, traduzirErro } from "@/lib/crud-config";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ tabela: string }> }) {
  const { tabela } = await ctx.params;
  const cfg = TABELAS[tabela];
  if (!cfg) return NextResponse.json({ erro: "Recurso não encontrado." }, { status: 404 });

  const url = new URL(req.url);
  const db = supabaseAdmin();

  let q = db.from(tabela).select("*").order(cfg.ordem.coluna, { ascending: cfg.ordem.asc });

  const busca = url.searchParams.get("busca");
  if (busca && cfg.busca?.length) {
    const termo = busca.replace(/[%,()]/g, "");
    q = q.or(cfg.busca.map((c) => `${c}.ilike.%${termo}%`).join(","));
  }

  if (url.searchParams.get("ativo") === "true") q = q.eq("ativo", true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({ dados: data ?? [] });
}

export async function POST(req: Request, ctx: { params: Promise<{ tabela: string }> }) {
  const { tabela } = await ctx.params;
  if (!TABELAS[tabela]) return NextResponse.json({ erro: "Recurso não encontrado." }, { status: 404 });

  if (!podeEscrever(await sessaoAtual())) {
    return NextResponse.json({ erro: "Seu perfil não permite alterações." }, { status: 403 });
  }

  const corpo = filtrarCampos(tabela, await req.json());
  if (Object.keys(corpo).length === 0) {
    return NextResponse.json({ erro: "Nenhum campo válido enviado." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin().from(tabela).insert(corpo).select().single();
  if (error) return NextResponse.json({ erro: traduzirErro(error.message) }, { status: 400 });

  return NextResponse.json({ dados: data });
}
