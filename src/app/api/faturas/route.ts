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

  /*
   * Visão padrão: o que vence neste mês, mais tudo que ficou para trás e
   * ainda não foi entregue. Sem isso a tela virava um arquivo histórico e o
   * mês corrente se perdia no meio.
   *
   * `competencia` ou `mesVencimento` explícitos desligam o padrão: aí a
   * pessoa está procurando um período específico e deve ver exatamente ele.
   */
  const mesVenc = url.searchParams.get("mesVencimento");
  const semRecorte = competencia || mesVenc || filtro === "vencidas" || url.searchParams.get("tudo") === "1";

  if (mesVenc) {
    // "2026-09" -> todo o mês
    const [ano, mes] = mesVenc.split("-").map(Number);
    if (ano && mes) {
      const primeiro = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const ultimo = new Date(ano, mes, 0).toISOString().slice(0, 10);
      q = q.gte("vencimento", primeiro).lte("vencimento", ultimo);
    }
  } else if (!semRecorte) {
    const hoje = new Date();
    const primeiroDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    /*
     * Do primeiro dia do mês em diante, OU vencida e ainda em aberto. O
     * "ou" precisa ser uma condição só, senão o filtro de mês esconderia
     * justamente as contas atrasadas que exigem ação.
     */
    q = q.or(
      `vencimento.gte.${primeiroDoMes},` +
        `and(vencimento.lt.${primeiroDoMes},status.in.(aguardando_documentos,documentos_recebidos,em_aprovacao))`
    );
  }

  /* Degraus de alerta por proximidade do vencimento. Contas já pagas ou
     canceladas ficam de fora: não há o que acompanhar nelas. */
  if (filtro === "hoje" || filtro === "urgente" || filtro === "mes") {
    const hoje = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    // assinada e entregue é fatura encerrada: não entra em alerta de vencimento
    q = q.not("status", "in", "(paga,entregue_contabilidade,cancelada)");

    if (filtro === "hoje") {
      q = q.eq("vencimento", iso(hoje));
    } else if (filtro === "urgente") {
      // de hoje até duas semanas à frente
      const limite = new Date(hoje);
      limite.setDate(limite.getDate() + 14);
      q = q.gte("vencimento", iso(hoje)).lte("vencimento", iso(limite));
    } else {
      // qualquer vencimento dentro do mês corrente
      const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      q = q.gte("vencimento", iso(primeiro)).lte("vencimento", iso(ultimo));
    }
  }
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
