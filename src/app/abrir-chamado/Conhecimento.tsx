"use client";

import { useEffect, useState } from "react";
import { BookOpenText, Search, ThumbsUp, ArrowRight, Lightbulb, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/UI";
import { sugerir, type ArtigoPublico } from "@/lib/conhecimento";

/** Artigos publicados da base de conhecimento, carregados uma vez para o portal inteiro. */
export function useArtigosPublicos() {
  const [artigos, setArtigos] = useState<ArtigoPublico[]>([]);
  useEffect(() => {
    fetch("/api/conhecimento/publico")
      .then((r) => r.json())
      .then((d) => setArtigos(d.artigos ?? []))
      .catch(() => {
        /* sem a base o portal segue igual: abrir chamado nunca depende dela */
      });
  }, []);
  return artigos;
}

const contar = (id: string, resolveu: boolean) =>
  fetch("/api/conhecimento/publico", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, resolveu }),
  }).catch(() => {});

/** Leitor do artigo, com a pergunta que importa: resolveu ou não? */
function LeitorArtigo({
  artigo,
  aoFechar,
  aoResolver,
}: {
  artigo: ArtigoPublico | null;
  aoFechar: () => void;
  aoResolver: () => void;
}) {
  useEffect(() => {
    if (artigo) contar(artigo.id, false);
  }, [artigo]);

  return (
    <Modal aberto={!!artigo} aoFechar={aoFechar} titulo={artigo?.titulo ?? ""} descricao={artigo?.categoria} largura="max-w-2xl">
      <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-t2">{artigo?.conteudo}</div>
      <div className="mt-6 flex flex-col gap-2 border-t pt-4 sm:flex-row" style={{ borderColor: "var(--linha)" }}>
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={() => {
            if (artigo) contar(artigo.id, true);
            aoResolver();
          }}
        >
          <ThumbsUp size={15} /> Resolveu, não preciso de chamado
        </button>
        <button type="button" className="btn-ghost flex-1" onClick={aoFechar}>
          Não resolveu, vou abrir o chamado <ArrowRight size={15} />
        </button>
      </div>
    </Modal>
  );
}

function ItemArtigo({ a, aoAbrir }: { a: ArtigoPublico; aoAbrir: (a: ArtigoPublico) => void }) {
  return (
    <button
      type="button"
      onClick={() => aoAbrir(a)}
      className="flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition hover:border-[var(--ouro-linha)]"
      style={{ borderColor: "var(--linha)", background: "var(--s2)" }}
    >
      <BookOpenText size={16} className="shrink-0 text-[var(--ouro)]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-t1">{a.titulo}</span>
        <span className="block text-[11px] text-t3">{a.categoria}</span>
      </span>
      <ArrowRight size={14} className="shrink-0 text-t3" />
    </button>
  );
}

/** Busca no topo do portal: "antes de abrir, veja se já tem solução". */
export function BuscaConhecimento({ artigos }: { artigos: ArtigoPublico[] }) {
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState<ArtigoPublico | null>(null);
  const [resolvido, setResolvido] = useState(false);

  if (artigos.length === 0) return null;
  const lista = q.trim() ? sugerir(artigos, q).slice(0, 6) : artigos.slice(0, 6);

  return (
    <div className="card mb-6 animate-fade-up" style={{ animationDelay: "40ms" }}>
      <h2 className="titulo-secao mb-1">Antes de abrir, veja se já tem solução</h2>
      <p className="mb-4 text-[13px] text-t3">A TI já escreveu o passo a passo dos problemas mais comuns.</p>

      {resolvido ? (
        <div className="flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold text-ok" style={{ borderColor: "rgba(52,232,158,.35)", background: "var(--ok-bg)" }}>
          <CheckCircle2 size={17} /> Que bom que resolveu! Não precisa abrir chamado.
        </div>
      ) : (
        <>
          <label className="fx-busca !max-w-none">
            <Search size={14} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Descreva o problema: impressora não imprime, esqueci a senha…" />
          </label>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {lista.map((a) => (
              <ItemArtigo key={a.id} a={a} aoAbrir={setAberto} />
            ))}
            {q.trim() && lista.length === 0 && (
              <p className="text-[13px] text-t3 sm:col-span-2">Nenhum artigo sobre isso. Abra o chamado logo abaixo.</p>
            )}
          </div>
        </>
      )}

      <LeitorArtigo
        artigo={aberto}
        aoFechar={() => setAberto(null)}
        aoResolver={() => {
          setAberto(null);
          setResolvido(true);
        }}
      />
    </div>
  );
}

/**
 * Sugestões dentro do formulário, conforme a pessoa escolhe o tipo e escreve o resumo:
 * a última chance de achar a solução antes de o chamado nascer.
 */
export function SugestoesNoFormulario({
  artigos,
  texto,
  categoria,
  aoResolver,
}: {
  artigos: ArtigoPublico[];
  texto: string;
  categoria: string;
  aoResolver: () => void;
}) {
  const [aberto, setAberto] = useState<ArtigoPublico | null>(null);
  const lista = sugerir(artigos, texto, categoria === "Outros" ? undefined : categoria).slice(0, 3);
  if (lista.length === 0) return null;

  return (
    <div className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--ouro-linha)", background: "var(--ouro-dim)" }}>
      <div className="mb-2.5 flex items-center gap-2 text-[12.5px] font-bold text-[var(--ouro-forte)]">
        <Lightbulb size={15} /> Talvez isto resolva
      </div>
      <div className="grid gap-2">
        {lista.map((a) => (
          <ItemArtigo key={a.id} a={a} aoAbrir={setAberto} />
        ))}
      </div>
      <LeitorArtigo
        artigo={aberto}
        aoFechar={() => setAberto(null)}
        aoResolver={() => {
          setAberto(null);
          aoResolver();
        }}
      />
    </div>
  );
}
