"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  RefreshCw, CalendarPlus, FileCheck2, Send, Printer, FileSpreadsheet,
  AlertTriangle, Eye, Loader2, MessageCircle, ExternalLink,
} from "lucide-react";
import { Badge, Modal, Vazio, Aviso, useAviso, BotaoAcao } from "@/components/UI";
import {
  moeda, data, competenciaLabel, competenciaAtual, linkWhatsApp, competenciaExtenso,
} from "@/lib/format";
import { STATUS_FATURA, alertaVencimento, type StatusFatura } from "@/lib/tipos";
import { DetalheFatura } from "./DetalheFatura";
import {
  FaixaFiltros, FiltroMulti, FiltroDatas, Segmento, BuscaFiltro,
  intervaloDoPeriodo, PERIODOS_RAPIDOS, type PeriodoRapido,
} from "@/components/Filtros";

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
  canal_cobranca: "email" | "whatsapp";
  fornecedor_whatsapp: string | null;
  categoria_id: string | null;
  categoria_nome: string | null;
  categoria_cor: string | null;
  qtd_documentos: number;
  numero_nota: string | null;
  exige_recibo: boolean;
  pagamento_automatico: boolean;
  documento_via_link: boolean;
  pago_em: string | null;
  /** Lançamento da nota no WinThor, gravado pelo agente da Rotina 750. */
  winthor_lancado_em?: string | null;
  winthor_valor?: number | null;
  winthor_recnum?: number | null;
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

  /*
   * Filtros no padrão dos sistemas: período de vencimento (atalho ou datas livres),
   * escolha múltipla por dimensão (vazio = todos) e os atalhos de alerta.
   * "padrao" é o recorte da casa: mês atual + o que ficou atrasado em aberto.
   */
  type Periodo = "padrao" | PeriodoRapido | "livre";
  const [f, setF] = useState({
    periodo: "padrao" as Periodo,
    de: "",
    ate: "",
    status: [] as string[],
    fornecedor: [] as string[],
    categoria: [] as string[],
    competencia: [] as string[],
    filtro: params.get("filtro") ?? "",
    busca: params.get("busca") ?? "",
  });
  const muda = (parcial: Partial<typeof f>) => setF((atual) => ({ ...atual, ...parcial }));

  // a mesma query vai para a lista e para o Excel: o arquivo sai igual à tela
  const qs = useMemo(() => {
    const q = new URLSearchParams();
    if (f.periodo === "tudo") q.set("tudo", "1");
    else if (f.periodo !== "padrao") {
      const { de, ate } = f.periodo === "livre" ? f : intervaloDoPeriodo(f.periodo);
      if (de) q.set("de", de);
      if (ate) q.set("ate", ate);
    }
    for (const k of ["status", "fornecedor", "categoria", "competencia"] as const) {
      if (f[k].length) q.set(k, f[k].join(","));
    }
    if (f.filtro) q.set("filtro", f.filtro);
    if (f.busca) q.set("busca", f.busca);
    return q.toString();
  }, [f]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/faturas?${qs}`);
      const d = await r.json();
      if (r.ok) setLinhas(d.dados ?? []);
      else mostrar("erro", d.erro ?? "Erro ao carregar as faturas.");
    } catch {
      mostrar("erro", "Falha de conexão ao carregar as faturas.");
    }
    setCarregando(false);
  }, [qs, mostrar]);

  useEffect(() => {
    const t = setTimeout(carregar, f.busca ? 380 : 0);
    return () => clearTimeout(t);
  }, [carregar, f.busca]);

  const [exportando, setExportando] = useState(false);
  async function exportar() {
    setExportando(true);
    try {
      const r = await fetch(`/api/faturas/exportar?${qs}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        mostrar("erro", d.erro ?? "Não foi possível gerar a planilha.");
        return;
      }
      const blob = await r.blob();
      const nome =
        r.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "faturas.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      mostrar("erro", "Falha de conexão ao gerar a planilha.");
    } finally {
      setExportando(false);
    }
  }

  /* ---------- opções e pílulas dos filtros ---------- */
  const opStatus = Object.entries(STATUS_FATURA).map(([id, v]) => ({ id, nome: v.label }));
  const opFornecedor = fornecedores.map((o) => ({ id: o.id, nome: o.nome }));
  const opCategoria = categorias.map((o) => ({ id: o.id, nome: o.nome, cor: o.cor }));
  const opCompetencia = competencias.map((c) => ({ id: c, nome: competenciaLabel(c) }));

  const nomeDe = (ops: Array<{ id: string; nome: string }>, id: string) =>
    ops.find((o) => o.id === id)?.nome ?? id;
  const pilulas = (
    [
      ["status", "Situação", opStatus],
      ["fornecedor", "Fornecedor", opFornecedor],
      ["categoria", "Categoria", opCategoria],
      ["competencia", "Competência", opCompetencia],
    ] as const
  ).flatMap(([k, rotulo, ops]) =>
    f[k].map((id) => ({
      rotulo,
      texto: nomeDe(ops, id),
      remover: () => setF((atual) => ({ ...atual, [k]: atual[k].filter((x) => x !== id) })),
    }))
  );

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
  const vencidas = linhas.filter(
    (f) => alertaVencimento(f.vencimento, f.status, f.pagamento_automatico).nivel === "vencida"
  );
  const revisao = linhas.filter((f) => f.precisa_revisao);

  // degraus de alerta, para os atalhos e o resumo do topo
  const porNivel = (n: string) =>
    linhas.filter(
      (f) => alertaVencimento(f.vencimento, f.status, f.pagamento_automatico).nivel === n
    );
  const venceHoje = porNivel("hoje");
  const urgentes = porNivel("urgente");
  const atencao = porNivel("atencao");

  return (
    <>
      {/* ---------- faixa de filtros ---------- */}
      <FaixaFiltros
        pilulas={pilulas}
        aoLimpar={() => muda({ status: [], fornecedor: [], categoria: [], competencia: [] })}
        direita={
          <span className="flex items-center gap-1.5">
            <button onClick={carregar} className="btn-ghost !h-[34px] !px-3" title="Atualizar">
              <RefreshCw size={14} className={carregando ? "animate-spin" : ""} />
            </button>
            <BotaoAcao
              onClick={exportar}
              carregando={exportando}
              disabled={linhas.length === 0}
              className="btn-ghost !h-[34px] !px-3"
              title={linhas.length ? "Exportar a lista filtrada para Excel" : "Nada para exportar com estes filtros"}
            >
              {!exportando && <FileSpreadsheet size={14} />}
              Excel
            </BotaoAcao>
            <button onClick={() => window.print()} className="btn-ghost !h-[34px] !px-3" title="Imprimir lista">
              <Printer size={14} />
            </button>
            <BotaoAcao onClick={gerarCompetencia} carregando={gerando} className="btn-primary !h-[34px]">
              <CalendarPlus size={14} />
              Abrir mês
            </BotaoAcao>
          </span>
        }
      >
        <Segmento
          valor={f.periodo === "livre" ? null : f.periodo}
          aoMudar={(v) => muda({ periodo: v })}
          opcoes={[
            {
              v: "padrao" as Periodo,
              rotulo: "Mês atual + atrasadas",
              titulo: "O que vence neste mês e o que ficou atrasado em aberto",
            },
            ...PERIODOS_RAPIDOS.filter((p) => p.v !== "ano_ant").map((p) => ({ v: p.v as Periodo, rotulo: p.rotulo })),
          ]}
        />
        <FiltroDatas
          de={f.periodo === "livre" ? f.de : f.periodo === "padrao" || f.periodo === "tudo" ? "" : intervaloDoPeriodo(f.periodo).de}
          ate={f.periodo === "livre" ? f.ate : f.periodo === "padrao" || f.periodo === "tudo" ? "" : intervaloDoPeriodo(f.periodo).ate}
          ativo={f.periodo === "livre"}
          rotuloVazio="Vencimento"
          aoAplicar={(de, ate) => muda({ periodo: "livre", de, ate })}
        />
        <FiltroMulti rotulo="Situação" opcoes={opStatus} selecionados={f.status} aoMudar={(v) => muda({ status: v })} />
        <FiltroMulti
          rotulo="Fornecedor"
          opcoes={opFornecedor}
          selecionados={f.fornecedor}
          aoMudar={(v) => muda({ fornecedor: v })}
        />
        <FiltroMulti
          rotulo="Categoria"
          opcoes={opCategoria}
          selecionados={f.categoria}
          aoMudar={(v) => muda({ categoria: v })}
        />
        <FiltroMulti
          rotulo="Competência"
          opcoes={opCompetencia}
          selecionados={f.competencia}
          aoMudar={(v) => muda({ competencia: v })}
        />
        <BuscaFiltro valor={f.busca} aoMudar={(v) => muda({ busca: v })} placeholder="Fornecedor ou contrato…" />
      </FaixaFiltros>

      {/* ---------- atalhos de alerta + total ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-3 animate-fade-up no-print">
        <Segmento
          valor={f.filtro}
          aoMudar={(v) => muda({ filtro: v === f.filtro ? "" : v })}
          opcoes={[
            { v: "", rotulo: "Todas", n: f.filtro ? undefined : linhas.length },
            { v: "aguardando", rotulo: "Aguardando documento", n: pendentes.length },
            { v: "vencidas", rotulo: "Vencidas", n: vencidas.length },
            { v: "hoje", rotulo: "Vence hoje", n: venceHoje.length },
            { v: "urgente", rotulo: "Até 2 semanas", n: urgentes.length },
            { v: "mes", rotulo: "Vence este mês", n: atencao.length + urgentes.length + venceHoje.length },
            { v: "revisao", rotulo: "A conferir", n: revisao.length },
          ]}
        />
        <span className="ml-auto text-sm">
          <span className="text-t3">Total listado: </span>
          <span className="num font-extrabold text-t1">{moeda(total)}</span>
          <span className="num ml-2 text-xs text-t3">({linhas.length})</span>
        </span>
      </div>

      {/* ---------- tabela ---------- */}
      <div className="table-wrap animate-fade-up" style={{ animationDelay: "80ms" }}>
        {carregando ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-t3">
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
                          <div className="font-bold text-t1">{f.fornecedor_nome}</div>
                          <div className="truncate text-xs text-t3">
                            {f.conta_descricao}
                            {f.identificador ? ` · ${f.identificador}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="whitespace-nowrap font-semibold text-t1">
                      {competenciaLabel(f.competencia)}
                    </td>

                    <td className="whitespace-nowrap">
                      {(() => {
                        const al = alertaVencimento(f.vencimento, f.status, f.pagamento_automatico);
                        const avisa = al.nivel !== "tranquilo" && al.nivel !== "quitada";
                        return (
                          <>
                            {/* Conta de débito automático não vence: a data é o
                                dia em que o valor sai do cartão, e dizer
                                "vencimento" ali seria cobrar um prazo de quem
                                já pagou. */}
                            {f.pagamento_automatico && (
                              <div className="text-[10px] font-bold uppercase tracking-wide text-info/70">
                                débito automático
                              </div>
                            )}
                            <div
                              className="font-semibold"
                              style={{ color: avisa ? al.cor : undefined }}
                              title={al.descricao}
                            >
                              {data(f.vencimento)}
                            </div>
                            {avisa && (
                              <div
                                className={`mt-0.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5
                                            text-[10px] font-bold ${al.classe} ${al.pulsar ? "animate-pulse" : ""}`}
                              >
                                {al.rotulo}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </td>

                    <td className="whitespace-nowrap text-right">
                      <div className="font-bold text-t1">{moeda(Number(f.valor_efetivo))}</div>
                      {f.valor_real != null && Number(f.valor_real) !== Number(f.valor_previsto) && (
                        <div className="text-[11px] text-t3">
                          previsto {moeda(Number(f.valor_previsto))}
                        </div>
                      )}
                    </td>

                    <td>
                      {/* Só o que chegou aparece aqui. O que ainda falta já está
                          dito na coluna Situação — repetir em amarelo poluía a
                          leitura e dava a impressão de documento existente. */}
                      <div className="flex items-center justify-center gap-1.5">
                        {/*
                          Fornecedor que só atende no WhatsApp não tem cobrança
                          automática: enquanto o documento não chega, o lugar do
                          traço é ocupado pelo botão que leva direto à conversa,
                          com a mensagem já escrita. Quando a nota chega, os
                          selos voltam a valer — o botão só existe para pedir o
                          que ainda falta.
                        */}
                        {f.canal_cobranca === "whatsapp" &&
                          !f.nota_fiscal_recebida_em &&
                          !f.fatura_recebida_em && <BotaoWhatsApp fatura={f} />}

                        {!(f.canal_cobranca === "whatsapp") &&
                          !f.nota_fiscal_recebida_em &&
                          !f.fatura_recebida_em &&
                          !f.precisa_revisao && (
                            <span className="text-xs text-t3">—</span>
                          )}
                        {/*
                          Conta cujo documento chega como link do portal (a
                          SAAM, via ContaAzul): nota e boleto são a mesma
                          página — mostrar os dois selos separados sugeriria
                          dois arquivos que não existem.
                        */}
                        {f.documento_via_link ? (
                          f.fatura_recebida_em && <Selo tipo="portal" />
                        ) : (
                          <>
                            {f.nota_fiscal_recebida_em && <Selo tipo="nota" />}
                            {/* Conta que se encerra com recibo não recebe fatura
                                nem boleto: chamar o documento de "Fatura" ali diria
                                que há algo a pagar, quando o pagamento já saiu. */}
                            {f.fatura_recebida_em && (
                              <Selo tipo={f.exige_recibo ? "recibo" : "fatura"} />
                            )}
                          </>
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
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-t3">
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

/**
 * Atalho para pedir a nota no WhatsApp.
 *
 * Existe para os fornecedores que não respondem por e-mail: o robô não tem o
 * que cobrar, e sem isto a linha ficaria só com um traço, sem dizer o que
 * fazer. A mensagem já vai escrita com contrato, competência e vencimento —
 * é o que evita ter que abrir a fatura para saber o que pedir.
 */
function BotaoWhatsApp({ fatura }: { fatura: FaturaLinha }) {
  const falta = [
    fatura.exige_nota_fiscal && !fatura.nota_fiscal_recebida_em ? "a nota fiscal" : null,
    fatura.exige_fatura && !fatura.fatura_recebida_em ? "o boleto" : null,
    fatura.exige_recibo && !fatura.fatura_recebida_em ? "o recibo do pagamento" : null,
  ].filter(Boolean);

  const mensagem = [
    "Olá! Aqui é do setor de TI da Lube Distribuidora.",
    "",
    `Poderia nos enviar ${falta.length ? falta.join(" e ") : "a nota fiscal e o boleto"} ` +
      `referente a ${fatura.conta_descricao} — ${competenciaExtenso(fatura.competencia)}, ` +
      `com vencimento em ${data(fatura.vencimento)}?`,
    "",
    "Obrigado!",
  ].join("\n");

  const href = linkWhatsApp(fatura.fornecedor_whatsapp, mensagem);

  if (!href) {
    return (
      <span
        title="Cadastre o WhatsApp deste fornecedor na aba Fornecedores"
        className="text-[10px] font-semibold text-atencao/80"
      >
        sem WhatsApp
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Pedir ${falta.join(" e ") || "os documentos"} no WhatsApp de ${fatura.fornecedor_nome}`}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold transition hover:brightness-125"
      style={{
        borderColor: "rgba(37,211,102,.5)",
        background: "rgba(37,211,102,.14)",
        color: "#7ee6a8",
      }}
    >
      <MessageCircle size={11} />
      Pedir no WhatsApp
    </a>
  );
}

/**
 * Selo de documento recebido.
 *
 * Como só aparece quando o documento chegou, a cor não precisa mais indicar
 * estado — ela distingue o tipo. Verde para a nota fiscal (documento fiscal),
 * azul para a fatura/boleto (documento de pagamento), ambos da mesma paleta
 * dos gráficos, testada para o fundo escuro.
 */
const SELOS = {
  nota: {
    rotulo: "NF",
    titulo: "Nota fiscal recebida",
    // verde: documento fiscal
    estilo: { borderColor: "rgba(25,158,112,.45)", background: "rgba(25,158,112,.14)", color: "#7fe3bd" },
    Icone: FileCheck2,
  },
  fatura: {
    rotulo: "Fatura",
    titulo: "Fatura/boleto recebido",
    // azul: documento de pagamento a fazer
    estilo: { borderColor: "rgba(57,135,229,.45)", background: "rgba(57,135,229,.14)", color: "#9ec5f4" },
    Icone: FileCheck2,
  },
  recibo: {
    rotulo: "Recibo",
    titulo: "Recibo do pagamento recebido",
    /*
     * Âmbar, e não o azul dos outros: o recibo é o único que comprova
     * pagamento já feito, e não algo a pagar. A cor destaca sozinha no meio
     * das linhas de nota e boleto, que são a maioria.
     */
    estilo: { borderColor: "rgba(217,142,38,.55)", background: "rgba(217,142,38,.16)", color: "#f0c674" },
    Icone: FileCheck2,
  },
  portal: {
    rotulo: "Link do portal",
    titulo: "Nota e boleto disponíveis no portal do fornecedor — abra a fatura para ver os detalhes",
    // mesmo azul da fatura: é a mesma família de documento, só entregue como link
    estilo: { borderColor: "rgba(57,135,229,.45)", background: "rgba(57,135,229,.14)", color: "#9ec5f4" },
    // o ícone já avisa que o clique sai do painel, antes mesmo de ler o rótulo
    Icone: ExternalLink,
  },
} as const;

function Selo({ tipo }: { tipo: keyof typeof SELOS }) {
  const { rotulo, titulo, estilo, Icone } = SELOS[tipo];
  return (
    <span
      title={titulo}
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold"
      style={estilo}
    >
      <Icone size={11} />
      {rotulo}
    </span>
  );
}
