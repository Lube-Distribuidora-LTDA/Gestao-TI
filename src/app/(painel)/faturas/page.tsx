import { Suspense } from "react";
import { ReceiptText } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { PageHeader, Skeleton } from "@/components/UI";
import { TelaFaturas } from "./TelaFaturas";

export const dynamic = "force-dynamic";

export default async function FaturasPage() {
  const db = supabaseAdmin();

  const [{ data: fornecedores }, { data: categorias }, { data: competencias }] = await Promise.all([
    db.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
    db.from("categorias_custo").select("id, nome, cor").eq("ativo", true).order("ordem"),
    db.from("faturas").select("competencia").order("competencia", { ascending: false }),
  ]);

  const listaCompetencias = [...new Set((competencias ?? []).map((c) => c.competencia as string))];

  return (
    <>
      <PageHeader
        Icone={ReceiptText}
        titulo="Faturas e notas fiscais"
        descricao="Controle das competências, documentos recebidos e cobrança dos fornecedores."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TelaFaturas
          fornecedores={fornecedores ?? []}
          categorias={categorias ?? []}
          competencias={listaCompetencias}
        />
      </Suspense>
    </>
  );
}
