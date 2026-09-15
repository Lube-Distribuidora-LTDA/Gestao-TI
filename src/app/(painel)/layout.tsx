import { Shell } from "@/components/Shell";
import { exigirSessao } from "@/lib/sessao-servidor";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const sessao = await exigirSessao();

  // contadores dos selos da navegação
  let faturas = 0;
  let chamados = 0;

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
    faturas = f.count ?? 0;
    chamados = c.count ?? 0;
  } catch {
    // banco indisponível não pode derrubar a navegação
  }

  return (
    <Shell
      usuario={{ nome: sessao.nome, email: sessao.email, papel: sessao.papel }}
      pendencias={{ faturas, chamados }}
    >
      {children}
    </Shell>
  );
}
