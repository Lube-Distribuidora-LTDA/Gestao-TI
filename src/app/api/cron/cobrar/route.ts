import { NextResponse } from "next/server";
import { executarCobrancas } from "@/lib/robo";
import { cronAutorizado } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Cobra os fornecedores que ainda não enviaram nota/fatura. */
export async function GET(req: Request) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const r = await executarCobrancas();
  return NextResponse.json({
    tarefa: "cobranca",
    ...r,
    detalhes: r.detalhes.slice(0, 30),
  });
}

export const POST = GET;
