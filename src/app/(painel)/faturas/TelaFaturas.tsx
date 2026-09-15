"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search, RefreshCw, CalendarPlus, FileCheck2, FileX2, Send, Printer,
  AlertTriangle, Filter, Eye, Loader2,
} from "lucide-react";
import { Badge, Modal, Vazio, Aviso, useAviso, BotaoAcao } from "@/components/UI";
import { moeda, data, competenciaLabel, competenciaAtual } from "@/lib/format";
import { STATUS_FATURA, type StatusFatura } from "@/lib/tipos";
import { DetalheFatura } from "./DetalheFatura";

export type FaturaLinha = {
  id: string;
  competencia: string;
  vencimento: string;
  status: StatusFatura;
  valor_previsto: number;
  valor_real: number | null;
  valor_efetivo: number;
  nota_fiscal_recebida_em: string | null;
  fatura_recebida_em: string | null;
  exige_nota_fiscal: boolean;
  exige_fatura: boolean;
  precisa_revisao: boolean;
  vencida: boolean;
  dias_atraso: number;
  cobrancas_enviadas: number;
  ultima_cobranca_em: string | null;
  conta_descricao: string;
  identificador: string | null;
  fornecedor_id: string;
  fornecedor_nome: string;
  email_cobranca: string | null;
  categoria_id: string | null;
  categoria_nome: string | null;
  categoria_cor: string | null;
  qtd_documentos: number;
  numero_nota: string | null;
  pago_em: string | null;
};

type Opcao = { id: string; nome: string; cor?: string };

export function TelaFaturas({
  fornecedores,
  categorias,
  competencias,
}: {
  fornecedores: Opcao[];
  categorias: Opcao[];
  competencias: string[];
}) {
  const params = useSearchParams();
  const { aviso, mostrar, limpar } = useAviso();

  const [linhas, setLinhas] = useState<FaturaLinha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const [filtros, setFiltros] = useState({
    competencia: "",
    status: "",
    fornecedor: "",
    categoria: "",
    filtro: params.get("filtro") ?? "",
    busca: params.get("busca") ?? "",
  });

  const carregar = useCallback(async () => {
    setCarregando(true);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v);

    try {
      const r = await fetch(`/api/faturas?${qs}`);
      const d = await r.json();
      if (r.ok) setLinhas(d.dados ?? []);
      else mostrar("erro", d.erro ?? "Erro ao carregar as faturas.");
    } catch {
      mostrar("erro", "Falha de conexão ao carregar as faturas.");
    }
    setCarregando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  useEffect(() => {
    const t = setTimeout(carregar, filtros.busca ? 380 : 0);
    return () => clearTimeout(t);
  }, [carregar, filtros.busca]);

  async function gerarCompetencia() {
    if (
      !confirm(
        `Abrir as competências de ${competenciaLabel(competenciaAtual())} para todas as contas ativas?\n\n` +
          "Contas que já possuem a competência são ignoradas — nada é duplicado."
      )
    )
      return;

    setGerando(true);
    try {
      const r = await fetch("/api/faturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia: competenciaAtual() }),
      });
      const d = await r.json();

      if (r.ok) {
        mostrar(
          "sucesso",
          d.criadas > 0
            ? `${d.criadas} competência(s) aberta(s). ${d.existentes} já existiam.`
            : `Nenhuma nova competência: todas as ${d.existentes} já estavam abertas.`
        );
        carregar();
      } else {
        mostrar("erro", d.erro ?? "Não foi possível gerar as competências.");
      }
    } catch {
      mostrar("erro", "Falha de conexão.");
    }
    setGerando(false);
  }

  /* ---------- totais do que está na tela ---------- */
  const total = linhas.reduce((s, f) => s + Number(f.valor_efetivo ?? 0), 0);
  const pendentes = linhas.filter((f) => f.status === "aguardando_documentos");
  const vencidas = linhas.filter((f) => f.vencida);
  const revisao = linhas.filter((f) => f.precisa_revisao);

  return (
    <>
      {/* ---------- barra de filtros ---------- */}
      <div className="card mb-5 animate-fade-up no-print">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[210px] flex-1">
            <label className="label">Buscar</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-lube-300/50" />
              <input
                className="input pl-9"
                placeholder="Fornecedor ou contrato..."
                value={filtros.busca}
                onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
              />
            </div>
          </div>

          <div className="w-[150px]">
            <label className="label">Competência</label>
            <select
              className="input"
              value={filtros.competencia}
              onChange={(e) => setFiltros({ ...filtros, competencia: e.target.value })}
            >
              <option value="">Todas</option>
              {competencias.map((c) => (
                <option key={c} value={c}>{competenciaLabel(c)}</option>
              ))}
            </select>
          </div>

          <div className="w-[185px]">
            <label className="label">Situação</label>
            <select
              className="input"
              value={filtros.status}
              onChange={(e) => setFiltros({ ...filtros, status: e.target.value, filtro: "" })}
            >
              <option value="">Todas</option>
              {Object.entries(STATUS_FATURA).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <div className="w-[175px]">
            <label className="label">Fornecedor</label>
            <select
              className="input"
              value={filtros.fornecedor}
              onChange={(e) => setFiltros({ ...filtros, fornecedor: e.target.value })}
            >
              <option value="">Todos</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>

          <div className="w-[175px]">
            <label className="label">Categoria</label>
            <select
              className="input"
              value={filtros.categoria}
              onChange={(e) => setFiltros({ ...filtros, categoria: e.target.value })}
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>

          <button onClick={carregar} className="btn-ghost" title="Atualizar">
            <RefreshCw size={15} className={carregando ? "animate-spin" : ""} />
          </button>
          <BotaoAcao onClick={gerarCompetencia} carregando={gerando} className="btn-primary">
            <CalendarPlus size={15} />
            Abrir mês
          </BotaoAcao>
          <button onClick={() => window.print()} className="btn-ghost" title="Imprimir lista">
            <Printer size={15} />
          </button>
        </div>

        {/* atalhos rápidos */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--color-border-soft)" }}>
          <Filter size={13} className="text-lube-300/60" />
          <Atalho
            ativo={!filtros.filtro && !filtros.status}
            onClick={() => setFiltros({ ...filtros, filtro: "", status: "" })}
          >
            Todas ({linhas.length})
          </Atalho>
          <Atalho
            ativo={filtros.status === "aguardando_documentos"}
            onClick={() => setFiltros({ ...filtros, status: "aguardando_documentos", filtro: "" })}
            cor="#c98500"
          >
            Aguardando documento ({pendentes.length})
          </Atalho>
          <Atalho
            ativo={filtros.filtro === "vencidas"}
            onClick={() => setFiltros({ ...filtros, filtro: "vencidas", status: "" })}
            cor="#ee1c25"
          >
            Vencidas ({vencidas.length})
          </Atalho>
          <Atalho
            ativo={filtros.filtro === "revisao"}
            onClick={() => setFiltros({ ...filtros, filtro: "revisao", status: "" })}
            cor="#9085e9"
          >
            A conferir ({revisao.length})
          </Atalho>

          <div className="ml-auto text-sm">
            <span className="text-lube-200/55">Total listado: </span>
            <span className="font-extrabold text-white">{moeda(total)}</span>
          </div>
        </div>
      </div>

      {/* ---------- tabela ---------- */}
      <div className="table-wrap animate-fade-up" style={{ animationDelay: "80ms" }}>
        {carregando ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-lube-200/55">
            <Loader2 size={18} className="animate-spin" />
            Carregando faturas...
          </div>
        ) : linhas.length === 0 ? (
          <Vazio
            titulo="Nenhuma fatura encontrada"
            descricao={
              competencias.length === 0
                ? "Cadastre fornecedores e contas e depois clique em 'Abrir mês' para gerar as competências."
                : "Ajuste os filtros ou abra a competência do mês."
            }
          />
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Fornecedor / Contrato</th>
                <th>Competência</th>
                <th>Vencimento</th>
                <th className="text-right">Valor</th>
                <th className="text-center">Documentos</th>
                <th>Situação</th>
                <th className="text-center no-print">Ações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((f) => {
                const e = STATUS_FATURA[f.status];
                return (
                  <tr key={f.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-8 w-1 shrink-0 rounded-full"
                          style={{ background: f.categoria_cor ?? "#64748b" }}
                          title={f.categoria_nome ?? "Sem categoria"}
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-white">{f.fornecedor_nome}</div>
                          <div className="truncate text-xs text-lube-200/55">
                            {f.conta_descricao}
                            {f.identificador ? ` · ${f.identificador}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="whitespace-nowrap font-semibold text-lube-100">
                      {competenciaLabel(f.competencia)}
                    </td>

                    <td className="whitespace-nowrap">
                      <div className={f.vencida ? "font-bold text-red-300" : "text-lube-100"}>
                        {data(f.vencimento)}
                      </div>
                      {f.vencida && (
                        <div className="text-[11px] text-red-300/75">
                          {f.dias_atraso} dia{f.dias_atraso === 1 ? "" : "s"} em atraso
                        </div>
                      )}
                    </td>

                    <td className="whitespace-nowrap text-right">
                      <div className="font-bold text-white">{moeda(Number(f.valor_efetivo))}</div>
                      {f.valor_real != null && Number(f.valor_real) !== Number(f.valor_previsto) && (
                        <div className="text-[11px] text-lube-200/50">
                          previsto {moeda(Number(f.valor_previsto))}
                        </div>
                      )}
                    </td>

                    <td>
                      <div className="flex items-center justify-center gap-1.5">
                        {f.exige_nota_fiscal && (
                          <Selo ok={!!f.nota_fiscal_recebida_em} rotulo="NF" />
                        )}
                        {f.exige_fatura && (
                          <Selo ok={!!f.fatura_recebida_em} rotulo="Fat" />
                        )}
                        {f.precisa_revisao && (
                          <span title="Documento recebido aguardando conferência">
                            <AlertTriangle size={14} className="text-violet-300" />
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <div className="flex flex-col gap-1">
                        <Badge classe={e.classe} ponto={e.ponto} pulsar={f.status === "aguardando_documentos"}>
                          {e.label}
                        </Badge>
                        {f.cobrancas_enviadas > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-lube-200/50">
                            <Send size={10} />
                            {f.cobrancas_enviadas} cobrança{f.cobrancas_enviadas > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="no-print">
                      <div className="flex justify-center">
                        <button
                          onClick={() => setSelecionada(f.id)}
                          className="btn-ghost !px-3 !py-1.5 !text-xs"
                        >
                          <Eye size={13} />
                          Abrir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        aberto={!!selecionada}
        aoFechar={() => setSelecionada(null)}
        titulo="Detalhe da fatura"
        descricao="Documentos, cobranças e baixa de pagamento"
        largura="max-w-3xl"
      >
        {selecionada && (
          <DetalheFatura
            faturaId={selecionada}
            aoAtualizar={() => {
              carregar();
            }}
            aoAvisar={mostrar}
            aoFechar={() => setSelecionada(null)}
          />
        )}
      </Modal>

      {aviso && <Aviso tipo={aviso.tipo} mensagem={aviso.mensagem} aoFechar={limpar} />}
    </>
  );
}

function Selo({ ok, rotulo }: { ok: boolean; rotulo: string }) {
  return (
    <span
      title={ok ? `${rotulo} recebida` : `${rotulo} pendente`}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
        ok
          ? "border-emerald-400/35 bg-emerald-400/12 text-emerald-200"
          : "border-amber-400/35 bg-amber-400/10 text-amber-200/80"
      }`}
    >
      {ok ? <FileCheck2 size={11} /> : <FileX2 size={11} />}
      {rotulo}
    </span>
  );
}

function Atalho({
  children,
  ativo,
  onClick,
  cor,
}: {
  children: React.ReactNode;
  ativo: boolean;
  onClick: () => void;
  cor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
        ativo ? "text-white" : "text-lube-200/65 hover:text-white"
      }`}
      style={{
        borderColor: ativo ? (cor ?? "#4659e0") : "var(--color-border-soft)",
        background: ativo ? `${cor ?? "#4659e0"}22` : "transparent",
      }}
    >
      {children}
    </button>
  );
}
