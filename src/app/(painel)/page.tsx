import Link from "next/link";
import {
  Wallet, AlertTriangle, CheckCircle2, LifeBuoy, TrendingUp, FileWarning,
  ArrowRight, Clock, Bot,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { KpiCard, PageHeader, Badge } from "@/components/UI";
import { GraficoEvolucao, GraficoCategorias, GraficoFornecedores, GraficoChamados } from "@/components/Graficos";
import { moeda, competenciaAtual, competenciaLabel, deslocarCompetencia, data, dataHora } from "@/lib/format";
import { STATUS_FATURA, STATUS_CHAMADO, PRIORIDADE, type StatusFatura, type StatusChamado, type PrioridadeChamado } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const db = supabaseAdmin();
  const compAtual = competenciaAtual();
  const inicioJanela = deslocarCompetencia(compAtual, -11);

  const [
    { data: mensal },
    { data: porCategoria },
    { data: porFornecedor },
    { data: kpiChamados },
    { data: pendentes },
    { data: chamadosRecentes },
    { data: ultimaExec },
  ] = await Promise.all([
    db.from("vw_custo_mensal").select("*").gte("competencia", inicioJanela).order("competencia"),
    db.from("vw_custo_por_categoria").select("*").eq("competencia", compAtual),
    db.from("vw_custo_por_fornecedor").select("*").gte("competencia", inicioJanela),
    db.from("vw_chamados_kpi").select("*").single(),
    db
      .from("vw_faturas_detalhe")
      .select("*")
      .in("status", ["aguardando_documentos", "documentos_recebidos", "em_aprovacao"])
      .order("vencimento")
      .limit(8),
    db
      .from("chamados")
      .select("id, protocolo, titulo, solicitante_nome, solicitante_setor, status, prioridade, aberto_em")
      .not("status", "in", "(fechado,cancelado)")
      .order("aberto_em", { ascending: false })
      .limit(6),
    db.from("robo_execucoes").select("*").order("iniciado_em", { ascending: false }).limit(1).maybeSingle(),
  ]);

  /* ---------- séries ---------- */
  const serieEvolucao = (mensal ?? []).map((m) => ({
    mes: competenciaLabel(m.competencia),
    total: Number(m.total ?? 0),
    pago: Number(m.total_pago ?? 0),
  }));

  const serieCategorias = (porCategoria ?? [])
    .map((c) => ({ nome: c.categoria_nome as string, total: Number(c.total ?? 0), cor: c.cor as string }))
    .sort((a, b) => b.total - a.total);

  // top 6 fornecedores do período, o resto vira "Outros" (nunca inventar cor nova)
  const agregadoForn = new Map<string, number>();
  for (const f of porFornecedor ?? []) {
    agregadoForn.set(f.fornecedor_nome, (agregadoForn.get(f.fornecedor_nome) ?? 0) + Number(f.total ?? 0));
  }
  const ordenados = [...agregadoForn.entries()].sort((a, b) => b[1] - a[1]);
  const serieFornecedores = ordenados.slice(0, 6).map(([nome, total]) => ({ nome, total }));
  const resto = ordenados.slice(6).reduce((s, [, v]) => s + v, 0);
  if (resto > 0) serieFornecedores.push({ nome: "Outros", total: resto });

  const k = kpiChamados ?? {};
  const serieChamados = [
    { status: "Abertos", qtd: Number(k.abertos ?? 0), cor: "#e66767" },
    { status: "Em atendimento", qtd: Number(k.em_atendimento ?? 0), cor: "#3987e5" },
    { status: "Aguardando", qtd: Number(k.aguardando_usuario ?? 0), cor: "#c98500" },
    { status: "Resolvidos", qtd: Number(k.resolvidos ?? 0), cor: "#199e70" },
  ];

  /* ---------- indicadores ---------- */
  const mesAtual = (mensal ?? []).find((m) => m.competencia === compAtual);
  const mesAnterior = (mensal ?? []).find((m) => m.competencia === deslocarCompetencia(compAtual, -1));

  const custoMes = Number(mesAtual?.total ?? 0);
  const custoAnterior = Number(mesAnterior?.total ?? 0);
  const variacao = custoAnterior > 0 ? ((custoMes - custoAnterior) / custoAnterior) * 100 : null;
  const custoAno = (mensal ?? [])
    .filter((m) => String(m.competencia).slice(0, 4) === compAtual.slice(0, 4))
    .reduce((s, m) => s + Number(m.total ?? 0), 0);

  const aguardando = (pendentes ?? []).filter((f) => f.status === "aguardando_documentos");
  const vencidas = (pendentes ?? []).filter((f) => f.vencida);
  const totalAguardando = aguardando.reduce((s, f) => s + Number(f.valor_efetivo ?? 0), 0);

  return (
    <>
      <PageHeader
        icone={<TrendingUp size={21} />}
        titulo="Visão geral"
        descricao={`Custos, pendências e atendimento do departamento de TI — ${competenciaLabel(compAtual)}`}
        acoes={
          ultimaExec && (
            <div className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"
                 style={{ borderColor: "var(--color-border-soft)", background: "rgba(255,255,255,.03)" }}>
              <Bot size={15} className={ultimaExec.sucesso === false ? "text-red-300" : "text-emerald-300"} />
              <span className="text-lube-200/70">Robô:</span>
              <span className="font-bold text-white">{dataHora(ultimaExec.iniciado_em)}</span>
            </div>
          )
        }
      />

      {/* ---------- KPIs ---------- */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          rotulo="Custo do mês"
          valor={moeda(custoMes)}
          icone={<Wallet size={20} />}
          cor="#3987e5"
          variacao={variacao}
          sub={mesAnterior ? `vs ${competenciaLabel(mesAnterior.competencia)}` : "sem base anterior"}
          destaque
          atraso={0}
        />
        <KpiCard
          rotulo={`Acumulado ${compAtual.slice(0, 4)}`}
          valor={moeda(custoAno)}
          icone={<TrendingUp size={20} />}
          cor="#9085e9"
          sub={`${(mensal ?? []).filter((m) => String(m.competencia).slice(0, 4) === compAtual.slice(0, 4)).length} meses`}
          atraso={60}
        />
        <KpiCard
          rotulo="Aguardando documentos"
          valor={String(aguardando.length)}
          icone={<FileWarning size={20} />}
          cor="#c98500"
          sub={totalAguardando > 0 ? moeda(totalAguardando) : "nenhuma pendência"}
          atraso={120}
        />
        <KpiCard
          rotulo="Chamados em aberto"
          valor={String(Number(k.abertos ?? 0) + Number(k.em_atendimento ?? 0))}
          icone={<LifeBuoy size={20} />}
          cor={Number(k.criticos_abertos ?? 0) > 0 ? "#e66767" : "#199e70"}
          sub={
            Number(k.criticos_abertos ?? 0) > 0
              ? `${k.criticos_abertos} crítico(s)`
              : k.horas_medias_resolucao
                ? `média de ${Number(k.horas_medias_resolucao).toFixed(1).replace(".", ",")}h`
                : "nenhum crítico"
          }
          atraso={180}
        />
      </div>

      {/* ---------- alerta de vencidas ---------- */}
      {vencidas.length > 0 && (
        <div
          className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-4 animate-fade-up"
          style={{ borderColor: "rgba(238,28,37,.4)", background: "rgba(238,28,37,.09)" }}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ee1c25]/20 animate-pulse-ring">
            <AlertTriangle size={19} className="text-red-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-red-100">
              {vencidas.length} fatura{vencidas.length > 1 ? "s" : ""} vencida
              {vencidas.length > 1 ? "s" : ""} sem documentação completa
            </div>
            <div className="mt-0.5 text-sm text-red-200/70">
              {vencidas
                .slice(0, 3)
                .map((f) => `${f.fornecedor_nome} (${data(f.vencimento)})`)
                .join(" · ")}
              {vencidas.length > 3 && ` e mais ${vencidas.length - 3}`}
            </div>
          </div>
          <Link href="/faturas?filtro=vencidas" className="btn-danger no-print">
            Tratar agora <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {/* ---------- gráficos ---------- */}
      <div className="mb-6 grid gap-5 xl:grid-cols-3">
        <div className="card animate-fade-up xl:col-span-2" style={{ animationDelay: "120ms" }}>
          <CabecalhoCard
            titulo="Evolução do custo de TI"
            sub="Últimos 12 meses · valor efetivo por competência"
          />
          <GraficoEvolucao dados={serieEvolucao} />
        </div>

        <div className="card animate-fade-up" style={{ animationDelay: "180ms" }}>
          <CabecalhoCard titulo="Custo por categoria" sub={competenciaLabel(compAtual)} />
          <GraficoCategorias dados={serieCategorias} />
        </div>
      </div>

      <div className="mb-6 grid gap-5 xl:grid-cols-2">
        <div className="card animate-fade-up" style={{ animationDelay: "220ms" }}>
          <CabecalhoCard titulo="Onde o dinheiro está indo" sub="Maiores fornecedores nos últimos 12 meses" />
          <GraficoFornecedores dados={serieFornecedores} />
        </div>

        <div className="card animate-fade-up" style={{ animationDelay: "260ms" }}>
          <CabecalhoCard titulo="Chamados por situação" sub="Todos os períodos" />
          <GraficoChamados dados={serieChamados} />
        </div>
      </div>

      {/* ---------- listas ---------- */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* faturas a vencer */}
        <div className="card animate-fade-up" style={{ animationDelay: "300ms" }}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <CabecalhoCard titulo="Próximas faturas" sub="Ordenadas por vencimento" semMargem />
            <Link href="/faturas" className="text-xs font-bold text-lube-300 hover:text-white">
              ver todas →
            </Link>
          </div>

          {(pendentes ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-lube-200/45">
              Nenhuma fatura pendente. Tudo em dia por aqui.
            </p>
          ) : (
            <div className="space-y-2">
              {(pendentes ?? []).map((f) => {
                const e = STATUS_FATURA[f.status as StatusFatura];
                return (
                  <Link
                    key={f.id}
                    href={`/faturas?busca=${encodeURIComponent(f.fornecedor_nome)}`}
                    className="flex items-center gap-3 rounded-xl border px-3.5 py-3 transition hover:border-lube-400/45 hover:bg-white/[0.04]"
                    style={{ borderColor: "var(--color-border-soft)" }}
                  >
                    <span
                      className="h-9 w-1 shrink-0 rounded-full"
                      style={{ background: f.categoria_cor ?? "#64748b" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-white">{f.fornecedor_nome}</div>
                      <div className="truncate text-xs text-lube-200/55">
                        {f.conta_descricao} · {competenciaLabel(f.competencia)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold text-white">{moeda(Number(f.valor_efetivo))}</div>
                      <div className={`text-[11px] font-semibold ${f.vencida ? "text-red-300" : "text-lube-200/55"}`}>
                        {f.vencida ? `venceu ${data(f.vencimento)}` : data(f.vencimento)}
                      </div>
                    </div>
                    <Badge classe={e.classe} ponto={e.ponto} pulsar={f.status === "aguardando_documentos"}>
                      {f.status === "aguardando_documentos"
                        ? "Falta doc."
                        : f.status === "documentos_recebidos"
                          ? "Recebido"
                          : e.label}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* chamados recentes */}
        <div className="card animate-fade-up" style={{ animationDelay: "340ms" }}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <CabecalhoCard titulo="Chamados ativos" sub="Mais recentes primeiro" semMargem />
            <Link href="/chamados" className="text-xs font-bold text-lube-300 hover:text-white">
              ver todos →
            </Link>
          </div>

          {(chamadosRecentes ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-lube-200/45">
              Nenhum chamado em aberto.
            </p>
          ) : (
            <div className="space-y-2">
              {(chamadosRecentes ?? []).map((c) => {
                const st = STATUS_CHAMADO[c.status as StatusChamado];
                const pr = PRIORIDADE[c.prioridade as PrioridadeChamado];
                return (
                  <Link
                    key={c.id}
                    href={`/chamados/${c.id}`}
                    className="flex items-center gap-3 rounded-xl border px-3.5 py-3 transition hover:border-lube-400/45 hover:bg-white/[0.04]"
                    style={{ borderColor: "var(--color-border-soft)" }}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${pr.ponto}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-white">{c.titulo}</div>
                      <div className="truncate text-xs text-lube-200/55">
                        {c.protocolo} · {c.solicitante_nome}
                        {c.solicitante_setor ? ` — ${c.solicitante_setor}` : ""}
                      </div>
                    </div>
                    <div className="hidden shrink-0 items-center gap-1 text-[11px] text-lube-200/50 sm:flex">
                      <Clock size={12} />
                      {data(c.aberto_em)}
                    </div>
                    <Badge classe={st.classe} ponto={st.ponto} pulsar={c.status === "aberto"}>
                      {st.label}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* rodapé de saúde */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-lube-200/40">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 size={13} className="text-emerald-400/70" />
          Sistema de Gestão de TI · Lube Distribuidora
        </span>
        <span>Competência {competenciaLabel(compAtual)}</span>
      </div>
    </>
  );
}

function CabecalhoCard({
  titulo,
  sub,
  semMargem,
}: {
  titulo: string;
  sub?: string;
  semMargem?: boolean;
}) {
  return (
    <div className={semMargem ? "" : "mb-4"}>
      <h2 className="text-base font-extrabold text-white">{titulo}</h2>
      {sub && <p className="mt-0.5 text-xs text-lube-200/50">{sub}</p>}
    </div>
  );
}
