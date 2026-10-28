import Link from "next/link";
import { KanbanSquare, BookOpenText } from "lucide-react";
import { PageHeader } from "@/components/UI";
import { Quadro } from "./Quadro";
import { BaseConhecimento } from "./BaseConhecimento";

export const dynamic = "force-dynamic";

/*
 * Duas abas no endereço (?aba=conhecimento), não em estado da tela: recarregar ou mandar o
 * link abre direto na aba certa.
 */
const ABAS = [
  { id: "quadro", rotulo: "Quadro", Icone: KanbanSquare, href: "/kanban" },
  { id: "conhecimento", rotulo: "Base de conhecimento", Icone: BookOpenText, href: "/kanban?aba=conhecimento" },
] as const;

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const aba = (await searchParams).aba === "conhecimento" ? "conhecimento" : "quadro";

  return (
    <>
      <PageHeader
        icone={<KanbanSquare size={21} />}
        titulo="Kanban TI"
        descricao={
          aba === "quadro"
            ? "As demandas da TI: projetos, o que chegou agora, o que está em andamento e o que espera retorno."
            : "Soluções escritas pela TI. As publicadas aparecem para quem vai abrir chamado no portal."
        }
      />

      <nav className="seg mb-5" aria-label="Abas do Kanban">
        {ABAS.map(({ id, rotulo, Icone, href }) => (
          <Link
            key={id}
            href={href}
            className={`inline-flex items-center gap-2 rounded-[7px] px-3.5 py-1.5 text-[12.5px] font-semibold transition
              ${aba === id ? "on" : ""}`}
            aria-current={aba === id ? "page" : undefined}
          >
            <Icone size={14} />
            {rotulo}
          </Link>
        ))}
      </nav>

      {aba === "quadro" ? <Quadro /> : <BaseConhecimento />}
    </>
  );
}
