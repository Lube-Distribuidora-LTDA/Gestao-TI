import { Shell } from "@/components/Shell";
import { exigirSessao } from "@/lib/sessao-servidor";

export const dynamic = "force-dynamic";

/**
 * Layout das telas autenticadas.
 *
 * Só valida a sessão — que é conferida na memória, sem ida ao banco. Os
 * contadores dos selos do menu são buscados pelo próprio Shell depois que a
 * tela aparece: enquanto estavam aqui, cada troca de página esperava duas
 * consultas ao Supabase antes de desenhar qualquer coisa.
 */
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const sessao = await exigirSessao();

  return (
    <Shell usuario={{ nome: sessao.nome, email: sessao.email, papel: sessao.papel }}>
      {children}
    </Shell>
  );
}
