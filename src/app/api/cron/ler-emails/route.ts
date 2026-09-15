import { NextResponse } from "next/server";
import { processarEmails } from "@/lib/robo";
import { cronAutorizado } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Varre o webmail e vincula notas/faturas às competências abertas. */
export async function GET(req: Request) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const r = await processarEmails();
  return NextResponse.json({
    tarefa: "leitura_email",
    ...r,
    detalhes: r.detalhes.slice(0, 30),
  });
}

export const POST = GET;
