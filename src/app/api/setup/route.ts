import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/** Informa se o sistema ainda não tem nenhum usuário (primeiro acesso). */
export async function GET() {
  try {
    const db = supabaseAdmin();
    const { count } = await db.from("perfis").select("id", { count: "exact", head: true });
    return NextResponse.json({ precisaSetup: (count ?? 0) === 0 });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Erro ao verificar o sistema." },
      { status: 500 }
    );
  }
}

/**
 * Cria o primeiro administrador.
 * Só funciona enquanto não existir nenhum usuário — depois disso a rota fecha
 * sozinha, para ninguém criar um admin por fora.
 */
export async function POST(req: Request) {
  try {
    const db = supabaseAdmin();

    const { count } = await db.from("perfis").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { erro: "O sistema já possui usuários. Peça a um administrador para criar seu acesso." },
        { status: 403 }
      );
    }

    const { nome, email, senha } = await req.json();

    if (!email || !senha || String(senha).length < 8) {
      return NextResponse.json(
        { erro: "Informe e-mail e uma senha de no mínimo 8 caracteres." },
        { status: 400 }
      );
    }

    const { data, error } = await db.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password: String(senha),
      email_confirm: true,
      user_metadata: { nome: nome || "Administrador" },
    });

    if (error || !data.user) {
      return NextResponse.json(
        { erro: error?.message ?? "Não foi possível criar o usuário." },
        { status: 400 }
      );
    }

    // garante o perfil de admin mesmo se o trigger não tiver rodado
    await db
      .from("perfis")
      .upsert(
        {
          id: data.user.id,
          email: data.user.email ?? String(email),
          nome: nome || "Administrador",
          papel: "admin",
          ativo: true,
        },
        { onConflict: "id" }
      );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Erro ao criar o administrador." },
      { status: 500 }
    );
  }
}
