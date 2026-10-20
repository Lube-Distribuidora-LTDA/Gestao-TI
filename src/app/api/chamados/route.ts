import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista de chamados do painel de atendimento. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const db = supabaseAdmin();

  let q = db.from("chamados").select("*");

  // situação e prioridade aceitam vários valores separados por vírgula (vazio = todos)
  const lista = (k: string) =>
    (url.searchParams.get(k) ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const status = lista("status");
  const prioridade = lista("prioridade");
  const busca = url.searchParams.get("busca");
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");

  // "ativos" = tudo que não foi fechado nem cancelado
  if (status.includes("ativos")) q = q.not("status", "in", "(fechado,cancelado)");
  const escolhidos = status.filter((x) => x !== "ativos");
  if (escolhidos.length) q = q.in("status", escolhidos);

  if (prioridade.length) q = q.in("prioridade", prioridade);

  // período pela data de abertura; o "até" vale o dia inteiro
  if (de) q = q.gte("aberto_em", `${de}T00:00:00-03:00`);
  if (ate) q = q.lte("aberto_em", `${ate}T23:59:59-03:00`);

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
