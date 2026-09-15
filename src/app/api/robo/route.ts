import { NextResponse } from "next/server";
import { processarEmails, executarCobrancas } from "@/lib/robo";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";
import { testarConexaoIMAP } from "@/lib/imap";
import { testarConexaoSMTP } from "@/lib/mailer";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Aciona o robô manualmente pelo painel. */
export async function POST(req: Request) {
  if (!podeEscrever(await sessaoAtual())) {
    return NextResponse.json({ erro: "Seu perfil não permite executar o robô." }, { status: 403 });
  }

  const { acao, dias } = await req.json();

  switch (acao) {
    case "ler_emails": {
      const r = await processarEmails({ dias: dias ? Number(dias) : undefined });
      return NextResponse.json(r, { status: r.erro && !r.sucesso ? 400 : 200 });
    }

    case "cobrar": {
      const r = await executarCobrancas();
      return NextResponse.json(r, { status: r.erro && !r.sucesso ? 400 : 200 });
    }

    case "testar_imap": {
      const r = await testarConexaoIMAP();
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }

    case "testar_smtp": {
      const r = await testarConexaoSMTP();
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }

    default:
      return NextResponse.json({ erro: "Ação desconhecida." }, { status: 400 });
  }
}

/** Histórico de execuções. */
export async function GET() {
  const { supabaseAdmin } = await import("@/lib/supabase");
  const { data } = await supabaseAdmin()
    .from("robo_execucoes")
    .select("*")
    .order("iniciado_em", { ascending: false })
    .limit(40);

  return NextResponse.json({ dados: data ?? [] });
}
