import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase";
import { assinarSessao, opcoesCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { email, senha } = await req.json();

    if (!email || !senha) {
      return NextResponse.json({ erro: "Informe e-mail e senha." }, { status: 400 });
    }

    // valida a senha contra o Supabase Auth (hash no servidor deles)
    const auth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const { data, error } = await auth.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password: String(senha),
    });

    if (error || !data.user) {
      return NextResponse.json({ erro: "E-mail ou senha incorretos." }, { status: 401 });
    }

    const db = supabaseAdmin();
    const { data: perfil } = await db
      .from("perfis")
      .select("nome, papel, ativo")
      .eq("id", data.user.id)
      .maybeSingle();

    if (perfil && !perfil.ativo) {
      return NextResponse.json({ erro: "Este usuário está desativado." }, { status: 403 });
    }

    const token = await assinarSessao({
      sub: data.user.id,
      email: data.user.email ?? "",
      nome: perfil?.nome ?? data.user.email?.split("@")[0] ?? "Usuário",
      papel: (perfil?.papel as "admin" | "tecnico" | "leitor") ?? "tecnico",
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set({ ...opcoesCookie(), value: token });
    return res;
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Falha no login." },
      { status: 500 }
    );
  }
}
