"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  LifeBuoy, Search, RefreshCw, Loader2, ExternalLink, Copy, CheckCircle2, Clock, Filter,
} from "lucide-react";
import { PageHeader, Badge, Vazio, Aviso, useAviso } from "@/components/UI";
import { dataHora, tempoRelativo } from "@/lib/format";
import { STATUS_CHAMADO, PRIORIDADE, type StatusChamado, type PrioridadeChamado } from "@/lib/tipos";

type Chamado = {
  id: string;
  protocolo: string;
  titulo: string;
  categoria: string;
  solicitante_nome: string;
  solicitante_email: string;
  solicitante_setor: string | null;
  status: StatusChamado;
  prioridade: PrioridadeChamado;
  responsavel: string | null;
  aberto_em: string;
  resolvido_em: string | null;
};

export default function ChamadosPage() {
  const { aviso, mostrar, limpar } = useAviso();
  const [lista, setLista] = useState<Chamado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtros, setFiltros] = useState({ status: "ativos", prioridade: "", busca: "" });
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v);

    const r = await fetch(`/api/chamados?${qs}`);
    const d = await r.json();
    if (r.ok) setLista(d.dados ?? []);
    setCarregando(false);
  }, [filtros]);

  useEffect(() => {
    const t = setTimeout(carregar, filtros.busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, filtros.busca]);

  function copiarLinkPortal() {
    const link = `${window.location.origin}/abrir-chamado`;
    navigator.clipboard.writeText(link);
    setCopiado(true);
    mostrar("sucesso", "Link do portal copiado. É só mandar para a equipe.");
    setTimeout(() => setCopiado(false), 2500);
  }

  const contagem = {
    abertos: lista.filter((c) => c.status === "aberto").length,
    atendimento: lista.filter((c) => c.status === "em_atendimento").length,
    criticos: lista.filter((c) => c.prioridade === "critica" && !["resolvido", "fechado"].includes(c.status)).length,
  };

  return (
    <>
      <PageHeader
        Icone={LifeBuoy}
        titulo="Chamados"
        descricao="Atendimento aos setores. Cada resposta sai por e-mail para o solicitante."
        acoes={
          <>
            <button onClick={copiarLinkPortal} className="btn-ghost">
              {copiado ? <CheckCircle2 size={15} className="text-emerald-400" /> : <Copy size={15} />}
              Copiar link do portal
            </button>
            <Link href="/abrir-chamado" target="_blank" className="btn-primary">
              <ExternalLink size={15} />
              Abrir portal
            </Link>
          </>
        }
      />

      <div className="card mb-5 animate-fade-up">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[230px] flex-1">
            <label className="label">Buscar</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-lube-300/50" />
              <input
                className="input pl-9"
                placeholder="Protocolo, título ou solicitante..."
                value={filtros.busca}
                onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
              />
            </div>
          </div>

          <div className="w-[190px]">
            <label className="label">Situação</label>
            <select
              className="input"
              value={filtros.status}
              onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
            >
              <option value="ativos">Em aberto</option>
              <option value="">Todos</option>
              {Object.entries(STATUS_CHAMADO).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <div className="w-[160px]">
            <label className="label">Prioridade</label>
            <select
              className="input"
              value={filtros.prioridade}
              onChange={(e) => setFiltros({ ...filtros, prioridade: e.target.value })}
            >
              <option value="">Todas</option>
              {Object.entries(PRIORIDADE).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <button onClick={carregar} className="btn-ghost">
            <RefreshCw size={15} className={carregando ? "animate-spin" : ""} />
          </button>
        </div>

        <div
          className="mt-3 flex flex-wrap items-center gap-4 border-t pt-3 text-xs"
          style={{ borderColor: "var(--color-border-soft)" }}
        >
          <Filter size={13} className="text-lube-300/60" />
          <span className="text-lube-200/60">
            <strong className="text-white">{lista.length}</strong> listados
          </span>
          <span className="text-lube-200/60">
            <strong className="text-red-300">{contagem.abertos}</strong> aguardando atendimento
          </span>
          <span className="text-lube-200/60">
            <strong className="text-sky-300">{contagem.atendimento}</strong> em andamento
          </span>
          {contagem.criticos > 0 && (
            <span className="font-bold text-red-300">{contagem.criticos} crítico(s)</span>
          )}
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center gap-3 py-16 text-sm text-lube-200/55">
          <Loader2 size={18} className="animate-spin" /> Carregando chamados...
        </div>
      ) : lista.length === 0 ? (
        <div className="card">
          <Vazio
            titulo="Nenhum chamado por aqui"
            descricao="Compartilhe o link do portal com os setores para começarem a abrir chamados."
            Icone={LifeBuoy}
            acao={
              <button onClick={copiarLinkPortal} className="btn-primary">
                <Copy size={15} /> Copiar link do portal
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          {lista.map((c, i) => {
            const st = STATUS_CHAMADO[c.status];
            const pr = PRIORIDADE[c.prioridade];
            return (
              <Link
                key={c.id}
                href={`/chamados/${c.id}`}
                className="card card-hover card-glow flex flex-wrap items-center gap-4 !py-4 animate-fade-up"
                style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}
              >
                <span
                  className={`h-11 w-1.5 shrink-0 rounded-full ${pr.ponto}`}
                  title={`Prioridade ${pr.label}`}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-extrabold tracking-wide text-lube-300">
                      {c.protocolo}
                    </span>
                    <Badge classe={st.classe} ponto={st.ponto} pulsar={c.status === "aberto"}>
                      {st.label}
                    </Badge>
                    {c.prioridade === "critica" && (
                      <Badge classe={pr.classe} ponto={pr.ponto} pulsar>
                        {pr.label}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-1.5 truncate text-[15px] font-bold text-white">{c.titulo}</div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-lube-200/55">
                    <span>{c.solicitante_nome}</span>
                    {c.solicitante_setor && <span>· {c.solicitante_setor}</span>}
                    <span>· {c.categoria}</span>
                    {c.responsavel && <span>· com {c.responsavel}</span>}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-lube-200/65">
                    <Clock size={12.5} />
                    {tempoRelativo(c.aberto_em)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-lube-200/40">{dataHora(c.aberto_em)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {aviso && <Aviso tipo={aviso.tipo} mensagem={aviso.mensagem} aoFechar={limpar} />}
    </>
  );
}
