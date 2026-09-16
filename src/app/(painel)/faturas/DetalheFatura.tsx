"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileText, Upload, Send, CheckCircle2, ExternalLink, Trash2, Loader2,
  AlertTriangle, Mail, Printer, Bot, User,
} from "lucide-react";
import { moeda, data, dataHora, competenciaExtenso, tamanhoArquivo, hojeISO } from "@/lib/format";
import { STATUS_FATURA, TIPO_DOCUMENTO, type StatusFatura, type TipoDocumento } from "@/lib/tipos";
import { Badge, BotaoAcao } from "@/components/UI";
import type { TipoAviso } from "@/components/UI";

type Documento = {
  id: string;
  tipo: TipoDocumento;
  confianca: "alta" | "media" | "baixa";
  nome_arquivo: string;
  tamanho_bytes: number | null;
  origem: "email" | "upload_manual";
  email_remetente: string | null;
  email_assunto: string | null;
  recebido_em: string;
  storage_path: string | null;
  confirmado_em: string | null;
};

type Cobranca = {
  id: string;
  tentativa: number;
  destinatario: string;
  assunto: string;
  status: string;
  enviada_em: string | null;
  erro: string | null;
  automatica: boolean;
};

export function DetalheFatura({
  faturaId,
  aoAtualizar,
  aoAvisar,
  aoFechar,
}: {
  faturaId: string;
  aoAtualizar: () => void;
  aoAvisar: (tipo: TipoAviso, msg: string) => void;
  aoFechar: () => void;
}) {
  const [fatura, setFatura] = useState<Record<string, any> | null>(null);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [valorReal, setValorReal] = useState("");
  const [numeroNota, setNumeroNota] = useState("");
  const [tipoUpload, setTipoUpload] = useState<TipoDocumento>("nota_fiscal");
  const inputArquivo = useRef<HTMLInputElement>(null);

  async function carregar() {
    setCarregando(true);
    const r = await fetch(`/api/faturas/${faturaId}`);
    const d = await r.json();
    if (r.ok) {
      setFatura(d.fatura);
      setDocumentos(d.documentos);
      setCobrancas(d.cobrancas);
      setValorReal(d.fatura.valor_real != null ? String(d.fatura.valor_real) : "");
      setNumeroNota(d.fatura.numero_nota ?? "");
    } else {
      aoAvisar("erro", d.erro ?? "Erro ao carregar a fatura.");
    }
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faturaId]);

  async function salvar(patch: Record<string, unknown>, msgOk: string) {
    setSalvando(true);
    const r = await fetch(`/api/faturas/${faturaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const d = await r.json();
    setSalvando(false);

    if (r.ok) {
      aoAvisar("sucesso", msgOk);
      carregar();
      aoAtualizar();
    } else {
      aoAvisar("erro", d.erro ?? "Não foi possível salvar.");
    }
  }

  async function cobrar() {
    if (!fatura?.email_cobranca) {
      aoAvisar("erro", "Este fornecedor não tem e-mail de cobrança cadastrado.");
      return;
    }
    if (
      !confirm(
        `Enviar cobrança para ${fatura.email_cobranca}?\n\n` +
          `Fornecedor: ${fatura.fornecedor_nome}\n` +
          `Competência: ${competenciaExtenso(fatura.competencia)}\n\n` +
          "O e-mail sai agora, em nome da TI da Lube."
      )
    )
      return;

    setCobrando(true);
    const r = await fetch(`/api/faturas/${faturaId}/cobrar`, { method: "POST" });
    const d = await r.json();
    setCobrando(false);

    if (r.ok && d.ok) {
      aoAvisar("sucesso", d.mensagem ?? "Cobrança enviada.");
      carregar();
      aoAtualizar();
    } else {
      aoAvisar("erro", d.erro ?? "Não foi possível enviar a cobrança.");
    }
  }

  async function enviarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;

    setEnviando(true);
    const form = new FormData();
    form.append("arquivo", arquivo);
    form.append("fatura_id", faturaId);
    form.append("tipo", tipoUpload);

    const r = await fetch("/api/documentos", { method: "POST", body: form });
    const d = await r.json();
    setEnviando(false);
    if (inputArquivo.current) inputArquivo.current.value = "";

    if (r.ok) {
      aoAvisar("sucesso", "Documento anexado.");
      carregar();
      aoAtualizar();
    } else {
      aoAvisar("erro", d.erro ?? "Falha no envio do arquivo.");
    }
  }

  async function abrirDocumento(id: string) {
    const r = await fetch(`/api/documentos/${id}`);
    const d = await r.json();
    if (r.ok) window.open(d.url, "_blank", "noopener");
    else aoAvisar("erro", d.erro ?? "Não foi possível abrir o documento.");
  }

  async function confirmarTipo(id: string, tipo: TipoDocumento) {
    const r = await fetch(`/api/documentos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo }),
    });
    if (r.ok) {
      aoAvisar("sucesso", "Classificação confirmada.");
      carregar();
      aoAtualizar();
    } else {
      aoAvisar("erro", "Não foi possível confirmar.");
    }
  }

  async function excluirDocumento(id: string, nome: string) {
    if (!confirm(`Excluir o documento "${nome}"?\n\nO arquivo é apagado definitivamente.`)) return;
    const r = await fetch(`/api/documentos/${id}`, { method: "DELETE" });
    if (r.ok) {
      aoAvisar("sucesso", "Documento excluído.");
      carregar();
      aoAtualizar();
    } else {
      aoAvisar("erro", "Não foi possível excluir.");
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-3 py-14 text-sm text-lube-200/55">
        <Loader2 size={18} className="animate-spin" />
        Carregando...
      </div>
    );
  }
  if (!fatura) return <p className="py-10 text-center text-sm text-lube-200/55">Fatura não encontrada.</p>;

  const est = STATUS_FATURA[fatura.status as StatusFatura];
  const faltaNF = fatura.exige_nota_fiscal && !fatura.nota_fiscal_recebida_em;
  const faltaFat = fatura.exige_fatura && !fatura.fatura_recebida_em;

  return (
    <div className="space-y-5">
      {/* ---------- cabeçalho ---------- */}
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--color-border-soft)", background: "rgba(255,255,255,.03)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold text-white">{fatura.fornecedor_nome}</div>
            <div className="text-sm text-lube-200/65">
              {fatura.conta_descricao}
              {fatura.identificador ? ` · ${fatura.identificador}` : ""}
            </div>
            <div className="mt-1 text-xs text-lube-200/45">
              {competenciaExtenso(fatura.competencia)} · vence {data(fatura.vencimento)}
              {fatura.vencida && <span className="ml-1 font-bold text-red-300">(em atraso)</span>}
            </div>
          </div>
          <div className="text-right">
            <Badge classe={est.classe} ponto={est.ponto}>{est.label}</Badge>
            <div className="mt-2 text-2xl font-extrabold text-white">
              {moeda(Number(fatura.valor_efetivo))}
            </div>
          </div>
        </div>

        {(faltaNF || faltaFat) && (
          <div
            className="mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold text-amber-100"
            style={{ borderColor: "rgba(201,133,0,.4)", background: "rgba(201,133,0,.1)" }}
          >
            <AlertTriangle size={14} />
            Falta receber: {[faltaNF && "nota fiscal", faltaFat && "fatura/boleto"].filter(Boolean).join(" e ")}
          </div>
        )}

        {fatura.precisa_revisao && (
          <div
            className="mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold text-violet-100"
            style={{ borderColor: "rgba(144,133,233,.4)", background: "rgba(144,133,233,.1)" }}
          >
            <AlertTriangle size={14} />
            O robô recebeu um documento mas não conseguiu identificar o tipo. Confirme abaixo.
          </div>
        )}
      </div>

      {/* ---------- ações rápidas ---------- */}
      <div className="flex flex-wrap gap-2">
        <BotaoAcao
          onClick={cobrar}
          carregando={cobrando}
          className="btn-danger"
          disabled={!faltaNF && !faltaFat}
          title={!faltaNF && !faltaFat ? "Documentos já recebidos" : "Enviar cobrança agora"}
        >
          <Send size={15} />
          Cobrar fornecedor
        </BotaoAcao>

        {fatura.status !== "entregue_contabilidade" && fatura.status !== "paga" && (
          <BotaoAcao
            onClick={() =>
              salvar(
                { status: "entregue_contabilidade", entregue_em: hojeISO() },
                "Marcada como assinada e entregue à contabilidade."
              )
            }
            carregando={salvando}
            className="btn-primary"
          >
            <CheckCircle2 size={15} />
            Assinado e entregue
          </BotaoAcao>
        )}

        {fatura.status === "documentos_recebidos" && (
          <button
            onClick={() => salvar({ status: "em_aprovacao" }, "Enviada para aprovação.")}
            className="btn-ghost"
          >
            Enviar para aprovação
          </button>
        )}

        <button onClick={() => window.print()} className="btn-ghost">
          <Printer size={15} />
          Imprimir
        </button>
      </div>

      {/* ---------- valores ---------- */}
      <div>
        <h3 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
          Conferência de valores
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Valor real da fatura</label>
            <input
              className="input"
              type="number"
              step="0.01"
              placeholder={String(fatura.valor_previsto)}
              value={valorReal}
              onChange={(e) => setValorReal(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Número da nota</label>
            <input
              className="input"
              placeholder="ex.: 15342"
              value={numeroNota}
              onChange={(e) => setNumeroNota(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <BotaoAcao
              carregando={salvando}
              onClick={() =>
                salvar(
                  {
                    valor_real: valorReal === "" ? null : Number(valorReal),
                    numero_nota: numeroNota || null,
                  },
                  "Valores atualizados."
                )
              }
              className="btn-primary w-full"
            >
              Salvar
            </BotaoAcao>
          </div>
        </div>
      </div>

      {/* ---------- documentos ---------- */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
            Documentos ({documentos.length})
          </h3>
          <div className="flex items-center gap-2">
            <select
              className="input !w-auto !py-1.5 !text-xs"
              value={tipoUpload}
              onChange={(e) => setTipoUpload(e.target.value as TipoDocumento)}
            >
              {Object.entries(TIPO_DOCUMENTO).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input
              ref={inputArquivo}
              type="file"
              className="hidden"
              onChange={enviarArquivo}
              accept=".pdf,.xml,.jpg,.jpeg,.png,.zip"
            />
            <BotaoAcao
              carregando={enviando}
              onClick={() => inputArquivo.current?.click()}
              className="btn-ghost !py-1.5 !text-xs"
            >
              <Upload size={13} />
              Anexar
            </BotaoAcao>
          </div>
        </div>

        {documentos.length === 0 ? (
          <p
            className="rounded-xl border border-dashed px-4 py-7 text-center text-sm text-lube-200/45"
            style={{ borderColor: "var(--color-border-soft)" }}
          >
            Nenhum documento recebido ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {documentos.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-2.5"
                style={{
                  borderColor: d.confianca === "baixa" ? "rgba(144,133,233,.45)" : "var(--color-border-soft)",
                  background: d.confianca === "baixa" ? "rgba(144,133,233,.07)" : "rgba(255,255,255,.025)",
                }}
              >
                <FileText size={17} className="shrink-0 text-lube-300" />

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">{d.nome_arquivo}</div>
                  <div className="flex flex-wrap items-center gap-x-2.5 text-[11px] text-lube-200/50">
                    <span className="inline-flex items-center gap-1">
                      {d.origem === "email" ? <Bot size={10} /> : <User size={10} />}
                      {d.origem === "email" ? "recebido por e-mail" : "enviado manualmente"}
                    </span>
                    <span>{dataHora(d.recebido_em)}</span>
                    {d.tamanho_bytes && <span>{tamanhoArquivo(d.tamanho_bytes)}</span>}
                    {d.email_remetente && <span className="truncate">de {d.email_remetente}</span>}
                  </div>
                </div>

                {d.confianca === "baixa" && !d.confirmado_em ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-violet-200">É o quê?</span>
                    <select
                      className="input !w-auto !py-1 !text-xs"
                      defaultValue=""
                      onChange={(e) => e.target.value && confirmarTipo(d.id, e.target.value as TipoDocumento)}
                    >
                      <option value="" disabled>Classificar</option>
                      {Object.entries(TIPO_DOCUMENTO).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="badge" style={corDoTipo(d.tipo)}>
                    {TIPO_DOCUMENTO[d.tipo]}
                  </span>
                )}

                <div className="flex items-center gap-1">
                  {d.storage_path && (
                    <button
                      onClick={() => abrirDocumento(d.id)}
                      className="rounded-lg p-2 text-lube-300 transition hover:bg-white/10 hover:text-white"
                      title="Abrir / imprimir"
                    >
                      <ExternalLink size={15} />
                    </button>
                  )}
                  <button
                    onClick={() => excluirDocumento(d.id, d.nome_arquivo)}
                    className="rounded-lg p-2 text-lube-300/60 transition hover:bg-[#ee1c25]/20 hover:text-red-300"
                    title="Excluir"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- cobranças ---------- */}
      {cobrancas.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
            Histórico de cobrança ({cobrancas.length})
          </h3>
          <div className="space-y-2">
            {cobrancas.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-2.5"
                style={{ borderColor: "var(--color-border-soft)", background: "rgba(255,255,255,.025)" }}
              >
                <Mail
                  size={16}
                  className={c.status === "enviada" ? "text-emerald-300" : "text-red-300"}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{c.assunto}</div>
                  <div className="text-[11px] text-lube-200/50">
                    {c.tentativa}ª tentativa · {c.destinatario} ·{" "}
                    {c.enviada_em ? dataHora(c.enviada_em) : "não enviada"} ·{" "}
                    {c.automatica ? "automática" : "manual"}
                  </div>
                  {c.erro && <div className="mt-0.5 text-[11px] text-red-300">{c.erro}</div>}
                </div>
                <Badge
                  classe={
                    c.status === "enviada"
                      ? "border-emerald-400/35 bg-emerald-400/12 text-emerald-200"
                      : "border-[#ee1c25]/45 bg-[#ee1c25]/12 text-red-200"
                  }
                >
                  {c.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end border-t pt-4" style={{ borderColor: "var(--color-border-soft)" }}>
        <button onClick={aoFechar} className="btn-ghost">Fechar</button>
      </div>
    </div>
  );
}

/**
 * Cor de cada tipo de documento, da mesma paleta dos gráficos.
 *
 * Verde é a nota fiscal, azul o documento de pagamento (fatura ou boleto).
 * A cor diz o que o documento é — nunca se ele chegou, já que aqui todos
 * chegaram.
 */
function corDoTipo(tipo: TipoDocumento): React.CSSProperties {
  const paleta: Record<TipoDocumento, [string, string]> = {
    nota_fiscal: ["25,158,112", "#7fe3bd"],   // verde
    fatura:      ["57,135,229", "#9ec5f4"],   // azul
    boleto:      ["57,135,229", "#9ec5f4"],   // azul — também é pagamento
    contrato:    ["144,133,233", "#c9c2f5"],  // violeta
    outro:       ["126,148,255", "#c9d4ff"],  // neutro
  };
  const [rgb, texto] = paleta[tipo] ?? paleta.outro;
  return {
    borderColor: `rgba(${rgb},.45)`,
    background: `rgba(${rgb},.14)`,
    color: texto,
  };
}
