"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LifeBuoy, RefreshCw, Loader2, ExternalLink, Copy, CheckCircle2, Clock,
} from "lucide-react";
import { PageHeader, Badge, Vazio, Aviso, useAviso } from "@/components/UI";
import {
  FaixaFiltros, FiltroMulti, FiltroDatas, Segmento, BuscaFiltro,
  intervaloDoPeriodo, PERIODOS_RAPIDOS, type PeriodoRapido,
} from "@/components/Filtros";
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
  // padrão dos sistemas: escopo em segmento, escolha múltipla (vazio = todos), período e busca
  const [f, setF] = useState({
    escopo: "ativos" as "ativos" | "todos",
    status: [] as string[],
    prioridade: [] as string[],
    periodo: "tudo" as PeriodoRapido | "livre",
    de: "",
    ate: "",
    busca: "",
  });
  const muda = (parcial: Partial<typeof f>) => setF((a) => ({ ...a, ...parcial }));

  const qs = useMemo(() => {
    const q = new URLSearchParams();
    const status = [...(f.escopo === "ativos" ? ["ativos"] : []), ...f.status];
    if (status.length) q.set("status", status.join(","));
    if (f.prioridade.length) q.set("prioridade", f.prioridade.join(","));
    const { de, ate } = f.periodo === "livre" ? f : intervaloDoPeriodo(f.periodo);
    if (de) q.set("de", de);
    if (ate) q.set("ate", ate);
    if (f.busca) q.set("busca", f.busca);
    return q.toString();
  }, [f]);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await fetch(`/api/chamados?${qs}`);
    const d = await r.json();
    if (r.ok) setLista(d.dados ?? []);
    setCarregando(false);
  }, [qs]);

  useEffect(() => {
    const t = setTimeout(carregar, f.busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, f.busca]);

  const opStatus = Object.entries(STATUS_CHAMADO).map(([id, v]) => ({ id, nome: v.label }));
  const opPrioridade = Object.entries(PRIORIDADE).map(([id, v]) => ({ id, nome: v.label }));
  const pilulas = [
    ...f.status.map((id) => ({
      rotulo: "Situação",
      texto: opStatus.find((o) => o.id === id)?.nome ?? id,
      remover: () => setF((a) => ({ ...a, status: a.status.filter((x) => x !== id) })),
    })),
    ...f.prioridade.map((id) => ({
      rotulo: "Prioridade",
      texto: opPrioridade.find((o) => o.id === id)?.nome ?? id,
      remover: () => setF((a) => ({ ...a, prioridade: a.prioridade.filter((x) => x !== id) })),
    })),
  ];
  const intervalo = f.periodo === "livre" ? f : intervaloDoPeriodo(f.periodo);

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
        icone={<LifeBuoy size={21} />}
        titulo="Chamados"
        descricao="Atendimento aos setores. Cada resposta sai por e-mail para o solicitante."
        acoes={
          <>
            <button onClick={copiarLinkPortal} className="btn-ghost">
              {copiado ? <CheckCircle2 size={15} className="text-ok" /> : <Copy size={15} />}
              Copiar link do portal
            </button>
            <Link href="/abrir-chamado" target="_blank" className="btn-primary">
              <ExternalLink size={15} />
              Abrir portal
            </Link>
          </>
        }
      />

      <FaixaFiltros
        pilulas={pilulas}
        aoLimpar={() => muda({ status: [], prioridade: [] })}
        direita={
          <button onClick={carregar} className="btn-ghost !h-[34px] !px-3" title="Atualizar">
            <RefreshCw size={14} className={carregando ? "animate-spin" : ""} />
          </button>
        }
      >
        <Segmento
          valor={f.escopo}
          aoMudar={(v) => muda({ escopo: v })}
          opcoes={[
            { v: "ativos", rotulo: "Em aberto" },
            { v: "todos", rotulo: "Todos" },
          ]}
        />
        <Segmento
          valor={f.periodo === "livre" ? null : f.periodo}
          aoMudar={(v) => muda({ periodo: v })}
          opcoes={PERIODOS_RAPIDOS}
        />
        <FiltroDatas
          de={intervalo.de}
          ate={intervalo.ate}
          ativo={f.periodo === "livre"}
          rotuloVazio="Abertura"
          aoAplicar={(de, ate) => muda({ periodo: "livre", de, ate })}
        />
        <FiltroMulti
          rotulo="Situação"
          opcoes={opStatus}
          selecionados={f.status}
          // escolher uma situação fechada com "Em aberto" ligado daria lista vazia: passa para "Todos"
          aoMudar={(v) => muda({ status: v, ...(v.length ? { escopo: "todos" as const } : {}) })}
        />
        <FiltroMulti
          rotulo="Prioridade"
          opcoes={opPrioridade}
          selecionados={f.prioridade}
          aoMudar={(v) => muda({ prioridade: v })}
        />
        <BuscaFiltro valor={f.busca} aoMudar={(v) => muda({ busca: v })} placeholder="Protocolo, título ou solicitante…" />
      </FaixaFiltros>

      <div className="mb-4 animate-fade-up">
        <div className="flex flex-wrap items-center gap-4 px-1 text-xs">
          <span className="text-t3">
            <strong className="text-t1">{lista.length}</strong> listados
          </span>
          <span className="text-t3">
            <strong className="text-perigo">{contagem.abertos}</strong> aguardando atendimento
          </span>
          <span className="text-t3">
            <strong className="text-info">{contagem.atendimento}</strong> em andamento
          </span>
          {contagem.criticos > 0 && (
            <span className="font-bold text-perigo">{contagem.criticos} crítico(s)</span>
          )}
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center gap-3 py-16 text-sm text-t3">
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
                    <span className="text-[11px] font-extrabold tracking-wide text-t3">
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

                  <div className="mt-1.5 truncate text-[15px] font-bold text-t1">{c.titulo}</div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-t3">
                    <span>{c.solicitante_nome}</span>
                    {c.solicitante_setor && <span>· {c.solicitante_setor}</span>}
                    <span>· {c.categoria}</span>
                    {c.responsavel && <span>· com {c.responsavel}</span>}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-t2">
                    <Clock size={12.5} />
                    {tempoRelativo(c.aberto_em)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-t3">{dataHora(c.aberto_em)}</div>
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
