import { NextResponse } from "next/server";
import { COOKIE_SESSAO } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: COOKIE_SESSAO, value: "", path: "/", maxAge: 0 });
  return res;
}
