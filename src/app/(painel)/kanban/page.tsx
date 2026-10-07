import { KanbanSquare } from "lucide-react";
import { PageHeader } from "@/components/UI";
import { Quadro } from "./Quadro";

export const dynamic = "force-dynamic";

export default function KanbanPage() {
  return (
    <>
      <PageHeader
        icone={<KanbanSquare size={21} />}
        titulo="Kanban TI"
        descricao="Os problemas internos da TI: o que está em análise, o que dá para resolver com calma e o que é crítico."
      />
      <Quadro />
    </>
  );
}
