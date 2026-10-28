"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpenText, Plus, Trash2, ExternalLink, Eye, ThumbsUp } from "lucide-react";
import { Modal, Vazio, Aviso, useAviso, BotaoAcao, Skeleton } from "@/components/UI";
import { FaixaFiltros, FiltroMulti, Segmento, BuscaFiltro } from "@/components/Filtros";
import { CATEGORIAS_CHAMADO } from "@/lib/tipos";
import { dataHora } from "@/lib/format";
import type { Artigo } from "@/lib/conhecimento";

const VAZIO = { titulo: "", categoria: "Outros", conteudo: "", palavras_chave: "", publicado: true };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Aba "Base de conhecimento" do Kanban TI: a TI escreve aqui o passo a passo dos problemas
 * que se repetem, e o que está publicado aparece no portal para quem vai abrir chamado.
 */
export function BaseConhecimento() {
  const { aviso, mostrar, limpar } = useAviso();
  const [artigos, setArtigos] = useState<Artigo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [busca, setBusca] = useState("");
  const [fCategoria, setFCategoria] = useState<string[]>([]);
  const [situacao, setSituacao] = useState<"todos" | "publicados" | "rascunhos">("todos");

  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState({ ...VAZIO });

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/conhecimento");
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro);
      setArtigos(d.artigos);
    } catch (e) {
      mostrar("erro", e instanceof Error && e.message ? e.message : "Não consegui carregar os artigos.");
    } finally {
      setCarregando(false);
    }
  }, [mostrar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setEditando(null);
    setForm({ ...VAZIO, categoria: fCategoria.length === 1 ? fCategoria[0] : "Outros" });
    setModal(true);
  }

  function abrirEdicao(a: Artigo) {
    setEditando(a.id);
    setForm({
      titulo: a.titulo,
      categoria: a.categoria,
      conteudo: a.conteudo,
      palavras_chave: a.palavras_chave ?? "",
      publicado: a.publicado,
    });
    setModal(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await fetch(editando ? `/api/conhecimento/${editando}` : "/api/conhecimento", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro);
      mostrar("sucesso", editando ? "Artigo atualizado." : form.publicado ? "Artigo publicado no portal." : "Rascunho salvo.");
      setModal(false);
      carregar();
    } catch (e) {
      mostrar("erro", e instanceof Error && e.message ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!editando || !confirm(`Excluir o artigo "${form.titulo}"? Ele some do portal também.`)) return;
    setSalvando(true);
    const r = await fetch(`/api/conhecimento/${editando}`, { method: "DELETE" });
    setSalvando(false);
    if (r.ok) {
      mostrar("sucesso", "Artigo excluído.");
      setModal(false);
      carregar();
    } else {
      mostrar("erro", "Não foi possível excluir.");
    }
  }

  /* ---------- filtros ---------- */
  const termos = norm(busca).split(/\s+/).filter(Boolean);
  const visiveis = artigos.filter(
    (a) =>
      (situacao === "todos" || (situacao === "publicados" ? a.publicado : !a.publicado)) &&
      (!fCategoria.length || fCategoria.includes(a.categoria)) &&
      termos.every((t) => norm(`${a.titulo} ${a.palavras_chave ?? ""} ${a.conteudo}`).includes(t))
  );
  const opCategoria = CATEGORIAS_CHAMADO.map((c) => ({
    id: c,
    nome: c,
    sub: String(artigos.filter((a) => a.categoria === c).length),
  }));
  const pilulas = fCategoria.map((c) => ({
    rotulo: "Categoria",
    texto: c,
    remover: () => setFCategoria((x) => x.filter((y) => y !== c)),
  }));

  return (
    <>
      <FaixaFiltros
        pilulas={pilulas}
        aoLimpar={() => setFCategoria([])}
        direita={
          <span className="flex items-center gap-1.5">
            <a href="/abrir-chamado" target="_blank" className="btn-ghost !h-[34px] !px-3" title="Ver como aparece no portal">
              <ExternalLink size={14} />
              Portal
            </a>
            <button onClick={abrirNovo} className="btn-primary !h-[34px]">
              <Plus size={14} />
              Novo artigo
            </button>
          </span>
        }
      >
        <Segmento
          valor={situacao}
          aoMudar={setSituacao}
          opcoes={[
            { v: "todos", rotulo: "Todos", n: artigos.length },
            { v: "publicados", rotulo: "Publicados", n: artigos.filter((a) => a.publicado).length },
            { v: "rascunhos", rotulo: "Rascunhos", n: artigos.filter((a) => !a.publicado).length },
          ]}
        />
        <FiltroMulti rotulo="Categoria" opcoes={opCategoria} selecionados={fCategoria} aoMudar={setFCategoria} />
        <BuscaFiltro valor={busca} aoMudar={setBusca} placeholder="Título, palavra-chave ou texto…" />
      </FaixaFiltros>

      {carregando ? (
        <Skeleton className="h-64 w-full" />
      ) : artigos.length === 0 ? (
        <div className="card">
          <Vazio
            titulo="Nenhum artigo ainda"
            descricao="Comece pelo que mais vira chamado: impressora que não imprime, senha bloqueada, internet lenta."
            Icone={BookOpenText}
            acao={
              <button onClick={abrirNovo} className="btn-primary">
                <Plus size={16} /> Escrever o primeiro
              </button>
            }
          />
        </div>
      ) : (
        <div className="table-wrap animate-fade-up">
          <table className="tbl">
            <thead>
              <tr>
                <th>Artigo</th>
                <th>Categoria</th>
                <th className="text-center">Situação</th>
                <th className="text-right" title="Vezes que foi aberto no portal">Abertos</th>
                <th className="text-right" title="Vezes que a pessoa disse que resolveu e não abriu chamado">
                  Resolveu
                </th>
                <th>Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-t3">
                    Nada com estes filtros
                  </td>
                </tr>
              )}
              {visiveis.map((a) => (
                <tr key={a.id} className="cursor-pointer" onClick={() => abrirEdicao(a)}>
                  <td>
                    <div className="font-bold text-t1">{a.titulo}</div>
                    <div className="max-w-[520px] truncate text-xs text-t3">{a.conteudo}</div>
                  </td>
                  <td className="whitespace-nowrap text-t2">{a.categoria}</td>
                  <td className="text-center">
                    <span
                      className={`badge ${
                        a.publicado ? "border-ok/35 bg-ok/10 text-ok" : "border-t3/30 bg-t3/10 text-t3"
                      }`}
                    >
                      {a.publicado ? "Publicado" : "Rascunho"}
                    </span>
                  </td>
                  <td className="text-right">
                    <span className="inline-flex items-center gap-1.5 text-t2">
                      <Eye size={13} className="text-t3" />
                      {a.visualizacoes}
                    </span>
                  </td>
                  <td className="text-right">
                    <span className={`inline-flex items-center gap-1.5 ${a.resolveu ? "text-ok" : "text-t3"}`}>
                      <ThumbsUp size={13} />
                      {a.resolveu}
                    </span>
                  </td>
                  <td className="num whitespace-nowrap text-xs text-t3">{dataHora(a.atualizado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        aberto={modal}
        aoFechar={() => setModal(false)}
        titulo={editando ? "Editar artigo" : "Novo artigo"}
        largura="max-w-3xl"
      >
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <div>
              <label className="label">Título *</label>
              <input
                className="input"
                required
                minLength={3}
                maxLength={200}
                placeholder="ex.: A impressora não imprime"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Categoria</label>
              <select
                className="input"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              >
                {CATEGORIAS_CHAMADO.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Solução, passo a passo *</label>
            <textarea
              className="input min-h-[240px] leading-relaxed"
              required
              minLength={10}
              maxLength={20000}
              placeholder={"1. Confira se a impressora está ligada e com papel.\n2. …\n\nSe não resolver, abra o chamado informando o que já tentou."}
              value={form.conteudo}
              onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Palavras-chave</label>
            <input
              className="input"
              maxLength={500}
              placeholder="ex.: não imprime, fila travada, papel atolado"
              value={form.palavras_chave}
              onChange={(e) => setForm({ ...form, palavras_chave: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-t3">
              Como a pessoa descreveria o problema. Ajuda o portal a sugerir este artigo.
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-t2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--ouro)]"
              checked={form.publicado}
              onChange={(e) => setForm({ ...form, publicado: e.target.checked })}
            />
            Publicado no portal de chamados
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--linha)" }}>
            {editando ? (
              <button type="button" onClick={excluir} disabled={salvando} className="btn-danger">
                <Trash2 size={15} /> Excluir
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setModal(false)} className="btn-ghost">
                Cancelar
              </button>
              <BotaoAcao type="submit" carregando={salvando}>
                Salvar
              </BotaoAcao>
            </div>
          </div>
        </form>
      </Modal>

      {aviso && <Aviso tipo={aviso.tipo} mensagem={aviso.mensagem} aoFechar={limpar} />}
    </>
  );
}
