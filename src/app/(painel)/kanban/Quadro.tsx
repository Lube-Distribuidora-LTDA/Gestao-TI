"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, GripVertical, User2, KanbanSquare } from "lucide-react";
import { Modal, Vazio, Aviso, useAviso, BotaoAcao, Skeleton } from "@/components/UI";

type Coluna = { id: string; nome: string; ordem: number; cor: string };
type Cartao = {
  id: string;
  coluna_id: string;
  titulo: string;
  descricao: string | null;
  responsavel: string | null;
  ordem: number;
  atualizado_em: string;
};

/*
 * Cores por nome, não hexadecimal solto: a coluna guarda "vermelho" e a tela
 * escolhe o tom. Assim trocar a cor pelo banco não exige mexer em CSS, e o
 * tema escuro continua valendo.
 */
const CORES: Record<string, { borda: string; fundo: string; texto: string; ponto: string }> = {
  azul:     { borda: "border-lube-400/35", fundo: "bg-lube-500/10",  texto: "text-lube-200",    ponto: "bg-lube-400" },
  verde:    { borda: "border-emerald-400/35", fundo: "bg-emerald-500/10", texto: "text-emerald-200", ponto: "bg-emerald-400" },
  vermelho: { borda: "border-red-400/35",  fundo: "bg-red-500/10",   texto: "text-red-200",     ponto: "bg-red-400" },
  ambar:    { borda: "border-amber-400/35", fundo: "bg-amber-500/10", texto: "text-amber-200",   ponto: "bg-amber-400" },
  cinza:    { borda: "border-white/12",    fundo: "bg-white/[.04]",  texto: "text-lube-200/70", ponto: "bg-lube-300/60" },
};
const cor = (nome: string) => CORES[nome] ?? CORES.cinza;

export function Quadro() {
  const { aviso, mostrar, limpar } = useAviso();

  const [colunas, setColunas] = useState<Coluna[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  const [novoEm, setNovoEm] = useState<string | null>(null);
  const [editando, setEditando] = useState<Cartao | null>(null);
  const [form, setForm] = useState({ titulo: "", descricao: "", responsavel: "" });

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/kanban");
      const d = await r.json();
      if (d.erro) throw new Error(d.erro);
      setColunas(d.colunas);
      setCartoes(d.cartoes);
    } catch (e) {
      mostrar("erro", e instanceof Error ? e.message : "Não consegui carregar o quadro.");
    } finally {
      setCarregando(false);
    }
  }, [mostrar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const daColuna = (id: string) =>
    cartoes.filter((c) => c.coluna_id === id).sort((a, b) => a.ordem - b.ordem);

  /*
   * O cartão muda de lugar na tela antes da resposta do servidor. Arrastar e
   * esperar o círculo girar passa sensação de travado; se a gravação falhar,
   * o recarregar devolve o quadro ao que o banco diz.
   */
  async function soltarEm(colunaId: string, e: React.DragEvent) {
    /* O id viaja no dataTransfer, não no estado do React: entre o dragstart e
       o drop pode não ter havido render, e aí o estado ainda estaria vazio.
       O estado fica só para o realce visual. */
    const id = e.dataTransfer.getData("text/plain") || arrastando;
    setArrastando(null);
    setAlvo(null);
    if (!id) return;

    const cartao = cartoes.find((c) => c.id === id);
    if (!cartao || cartao.coluna_id === colunaId) return;

    const ordem = daColuna(colunaId).length;
    setCartoes((atual) =>
      atual.map((c) => (c.id === id ? { ...c, coluna_id: colunaId, ordem } : c))
    );

    try {
      const r = await fetch(`/api/kanban/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coluna_id: colunaId, ordem }),
      });
      const d = await r.json();
      if (d.erro) throw new Error(d.erro);
    } catch (e) {
      mostrar("erro", e instanceof Error ? e.message : "Não consegui mover o cartão.");
      carregar();
    }
  }

  async function salvar() {
    if (!form.titulo.trim()) return mostrar("erro", "Escreva um título para o cartão.");
    setSalvando(true);
    try {
      const destino = editando ? `/api/kanban/${editando.id}` : "/api/kanban";
      const r = await fetch(destino, {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, coluna_id: editando?.coluna_id ?? novoEm }),
      });
      const d = await r.json();
      if (d.erro) throw new Error(d.erro);
      fechar();
      mostrar("sucesso", editando ? "Cartão atualizado." : "Cartão criado.");
      carregar();
    } catch (e) {
      mostrar("erro", e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(c: Cartao) {
    if (!confirm(`Excluir o cartão "${c.titulo}"?`)) return;
    try {
      const r = await fetch(`/api/kanban/${c.id}`, { method: "DELETE" });
      const d = await r.json();
      if (d.erro) throw new Error(d.erro);
      setCartoes((atual) => atual.filter((x) => x.id !== c.id));
    } catch (e) {
      mostrar("erro", e instanceof Error ? e.message : "Não consegui excluir.");
    }
  }

  function abrirNovo(colunaId: string) {
    setEditando(null);
    setNovoEm(colunaId);
    setForm({ titulo: "", descricao: "", responsavel: "" });
  }

  function abrirEdicao(c: Cartao) {
    setNovoEm(null);
    setEditando(c);
    setForm({ titulo: c.titulo, descricao: c.descricao ?? "", responsavel: c.responsavel ?? "" });
  }

  function fechar() {
    setNovoEm(null);
    setEditando(null);
  }

  if (carregando) return <Skeleton className="h-96 w-full" />;

  if (!colunas.length) {
    return <Vazio titulo="Nenhuma coluna configurada" descricao="O quadro precisa de pelo menos uma coluna." Icone={KanbanSquare} />;
  }

  return (
    <>
      {aviso && <Aviso tipo={aviso.tipo} mensagem={aviso.mensagem} aoFechar={limpar} />}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {colunas.map((col) => {
          const lista = daColuna(col.id);
          const c = cor(col.cor);
          const realcar = alvo === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (alvo !== col.id) setAlvo(col.id);
              }}
              onDragLeave={() => setAlvo((a) => (a === col.id ? null : a))}
              onDrop={(e) => soltarEm(col.id, e)}
              className={`flex w-[290px] shrink-0 flex-col rounded-2xl border transition-colors ${
                realcar ? `${c.borda} ${c.fundo}` : "border-white/10 bg-white/[.02]"
              }`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${c.ponto}`} />
                  <h3 className="text-sm font-bold text-white">{col.nome}</h3>
                  <span className={`text-xs font-semibold ${c.texto}`}>{lista.length}</span>
                </div>
                <button
                  onClick={() => abrirNovo(col.id)}
                  className="btn-ghost rounded-lg p-1.5"
                  title={`Novo cartão em ${col.nome}`}
                >
                  <Plus size={15} />
                </button>
              </div>

              <div className="flex min-h-[140px] flex-col gap-2 p-3">
                {lista.map((cartao) => (
                  <div
                    key={cartao.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", cartao.id);
                      e.dataTransfer.effectAllowed = "move";
                      setArrastando(cartao.id);
                    }}
                    onDragEnd={() => {
                      setArrastando(null);
                      setAlvo(null);
                    }}
                    onClick={() => abrirEdicao(cartao)}
                    className={`group cursor-grab rounded-xl border border-white/10 bg-lube-900/50 p-3 transition active:cursor-grabbing ${
                      arrastando === cartao.id ? "opacity-40" : "hover:border-white/25"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical size={14} className="mt-0.5 shrink-0 text-lube-300/40" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-white">{cartao.titulo}</p>
                        {cartao.descricao && (
                          <p className="mt-1 line-clamp-2 text-xs text-lube-200/55">{cartao.descricao}</p>
                        )}
                        {cartao.responsavel && (
                          <p className="mt-2 flex items-center gap-1 text-[11px] text-lube-200/50">
                            <User2 size={11} /> {cartao.responsavel}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          excluir(cartao);
                        }}
                        className="btn-ghost rounded-lg p-1 opacity-0 transition group-hover:opacity-100"
                        title="Excluir cartão"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}

                {!lista.length && (
                  <button
                    onClick={() => abrirNovo(col.id)}
                    className="rounded-xl border border-dashed border-white/12 px-3 py-6 text-xs text-lube-200/40 transition hover:border-white/25 hover:text-lube-200/70"
                  >
                    Arraste um cartão para cá, ou clique para criar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        aberto={Boolean(novoEm || editando)}
        aoFechar={fechar}
        titulo={editando ? "Editar cartão" : "Novo cartão"}
        largura="max-w-lg"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Problema</label>
            <input
              className="input"
              autoFocus
              placeholder="Ex.: Servidor de arquivos sem backup há 3 dias"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Detalhes (opcional)</label>
            <textarea
              className="input min-h-[96px] resize-y"
              placeholder="O que já foi tentado, o que falta, onde dói"
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Responsável (opcional)</label>
            <input
              className="input"
              placeholder="Quem está cuidando"
              value={form.responsavel}
              onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
            <button className="btn btn-ghost" onClick={fechar}>Cancelar</button>
            <BotaoAcao onClick={salvar} carregando={salvando} className="btn btn-primary">
              Salvar
            </BotaoAcao>
          </div>
        </div>
      </Modal>
    </>
  );
}
