import { Skeleton } from "@/components/UI";

/**
 * Aparece no instante do clique, enquanto a tela real é montada no servidor.
 *
 * Sem isto o navegador fica parado na página anterior até a resposta chegar,
 * e a navegação passa a impressão de ter travado — mesmo levando menos de um
 * segundo. O esqueleto é propositalmente parecido com o conteúdo que vem a
 * seguir, para a troca não dar solavanco.
 */
export default function Carregando() {
  return (
    <div className="animate-fade-up">
      {/* cabeçalho */}
      <div className="mb-7 flex items-start gap-3.5">
        <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="flex-1">
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        </div>
      </div>

      {/* barra de filtros / cartões */}
      <Skeleton className="mb-5 h-24 w-full rounded-2xl" />

      {/* corpo */}
      <div className="space-y-2.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton
            key={i}
            className="h-14 w-full rounded-xl"
            // some aos poucos, para a lista não pular de uma vez
            style={{ opacity: 1 - i * 0.13 }}
          />
        ))}
      </div>
    </div>
  );
}
