import { NextResponse } from "next/server";
import { opcoesCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // dentro do Painel Lube o cookie é particionado: para apagar, precisa dos mesmos atributos
  const corpo = await req.json().catch(() => ({}));
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...opcoesCookie(corpo?.emQuadro === true), value: "", maxAge: 0 });
  return res;
}
