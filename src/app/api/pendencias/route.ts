import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contadores dos selos do menu lateral.
 *
 * Vive numa rota própria para não travar a navegação: antes essas duas
 * consultas rodavam no layout, então toda troca de tela esperava o banco
 * responder antes de desenhar qualquer coisa. Agora a tela aparece na hora e
 * os números chegam logo atrás.
 */
export async function GET() {
  try {
    const db = supabaseAdmin();

    const [f, c] = await Promise.all([
      db
        .from("faturas")
        .select("id", { count: "exact", head: true })
        .eq("status", "aguardando_documentos"),
      db
        .from("chamados")
        .select("id", { count: "exact", head: true })
        .in("status", ["aberto", "em_atendimento"]),
    ]);

    return NextResponse.json({
      faturas: f.count ?? 0,
      chamados: c.count ?? 0,
    });
  } catch {
    // contador é enfeite: se falhar, o menu segue sem número
    return NextResponse.json({ faturas: 0, chamados: 0 });
  }
}
