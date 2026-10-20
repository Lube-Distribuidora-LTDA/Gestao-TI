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
        descricao="As demandas da TI: projetos, o que chegou agora, o que está em andamento e o que espera retorno."
      />
      <Quadro />
    </>
  );
}
