import { NextResponse } from "next/server";
import { executarCobrancas } from "@/lib/robo";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Cobrança disparada manualmente pela tela, ignorando a janela de dias. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!podeEscrever(await sessaoAtual())) {
    return NextResponse.json({ erro: "Seu perfil não permite enviar cobranças." }, { status: 403 });
  }

  const r = await executarCobrancas({ forcarFaturaId: id });

  if (r.enviadas > 0) {
    return NextResponse.json({ ok: true, mensagem: r.detalhes.find((d) => d.ok)?.resultado });
  }

  const motivo = r.detalhes[0]?.resultado ?? r.erro ?? "Nada a cobrar nesta fatura.";
  return NextResponse.json({ ok: false, erro: motivo }, { status: 400 });
}
