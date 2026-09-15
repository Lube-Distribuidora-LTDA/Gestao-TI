"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot, Mail, Send, PlugZap, RefreshCw, CheckCircle2, XCircle, Loader2,
  Inbox, FileCheck2, Clock,
} from "lucide-react";
import { PageHeader, Aviso, useAviso, BotaoAcao, Badge, Vazio } from "@/components/UI";
import { dataHora } from "@/lib/format";

type Execucao = {
  id: string;
  tipo: string;
  iniciado_em: string;
  finalizado_em: string | null;
  sucesso: boolean | null;
  emails_lidos: number;
  documentos_vinculados: number;
  cobrancas_enviadas: number;
  detalhes: Record<string, any> | null;
  erro: string | null;
};

const ROTULO_TIPO: Record<string, string> = {
  leitura_email: "Leitura do webmail",
  cobranca: "Cobrança de documentos",
  geracao_faturas: "Abertura de competências",
};

export default function RoboPage() {
  const { aviso, mostrar, limpar } = useAviso();
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await fetch("/api/robo");
    const d = await r.json();
    if (r.ok) setExecucoes(d.dados ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function executar(acao: string, rotulo: string) {
    // só a cobrança sai da empresa — as outras ações são inócuas e rodam direto
    if (acao === "cobrar") {
      const ok = confirm(
        "Executar a rodada de cobrança agora?\n\n" +
          "O sistema vai enviar e-mails reais para os fornecedores que estão dentro da " +
          "janela de cobrança e ainda não mandaram os documentos."
      );
      if (!ok) return;
    }

    setOcupado(acao);
    try {
      const r = await fetch("/api/robo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      const d = await r.json();

      if (acao === "testar_imap") {
        r.ok
          ? mostrar("sucesso", `Conexão IMAP OK. Pastas encontradas: ${(d.pastas ?? []).slice(0, 6).join(", ")}`)
          : mostrar("erro", `Falha no IMAP: ${d.erro}`);
      } else if (acao === "testar_smtp") {
        r.ok ? mostrar("sucesso", "Conexão SMTP OK — pronto para enviar e-mails.") : mostrar("erro", `Falha no SMTP: ${d.erro}`);
      } else if (acao === "ler_emails") {
        if (r.ok) {
          mostrar(
            "sucesso",
            `${rotulo} concluída.\n` +
              `${d.emailsLidos} e-mail(s) na janela · ${d.candidatos ?? 0} de fornecedor com anexo · ` +
              `${d.baixados ?? 0} baixado(s)\n` +
              `${d.documentosVinculados} documento(s) vinculado(s) · ${d.faturasAtualizadas} fatura(s) atualizada(s).` +
              (d.erro ? `\n${d.erro}` : "")
          );
        } else {
          mostrar("erro", d.erro ?? "Falha na leitura.");
        }
      } else if (acao === "cobrar") {
        if (r.ok) {
          mostrar(
            "sucesso",
            `${rotulo} concluída.\n${d.enviadas} cobrança(s) enviada(s) · ${d.ignoradas} ignorada(s) · ${d.falhas} falha(s).` +
              (d.erro ? `\n${d.erro}` : "")
          );
        } else {
          mostrar("erro", d.erro ?? "Falha na cobrança.");
        }
      }

      carregar();
    } catch {
      mostrar("erro", "Falha de conexão com o servidor.");
    }
    setOcupado(null);
  }

  return (
    <>
      <PageHeader
        Icone={Bot}
        titulo="Robô de e-mail"
        descricao="Lê o webmail, reconhece as notas dos fornecedores e cobra quem ainda não enviou."
        acoes={
          <button onClick={carregar} className="btn-ghost">
            <RefreshCw size={15} className={carregando ? "animate-spin" : ""} />
            Atualizar
          </button>
        }
      />

      {/* ---------- ações ---------- */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CardAcao
          Icone={Inbox}
          cor="#3987e5"
          titulo="Ler webmail agora"
          descricao="Varre a caixa de entrada, baixa os anexos e vincula às competências abertas."
          botao="Executar leitura"
          carregando={ocupado === "ler_emails"}
          onClick={() => executar("ler_emails", "Leitura")}
        />
        <CardAcao
          Icone={Send}
          cor="#ee1c25"
          titulo="Cobrar fornecedores"
          descricao="Envia e-mail formal para quem ainda não mandou nota ou fatura dentro da janela."
          botao="Executar cobrança"
          carregando={ocupado === "cobrar"}
          onClick={() => executar("cobrar", "Cobrança")}
          perigo
        />
        <CardAcao
          Icone={PlugZap}
          cor="#199e70"
          titulo="Testar IMAP"
          descricao="Confere se as credenciais de leitura do webmail estão corretas."
          botao="Testar conexão"
          carregando={ocupado === "testar_imap"}
          onClick={() => executar("testar_imap", "Teste IMAP")}
        />
        <CardAcao
          Icone={Mail}
          cor="#9085e9"
          titulo="Testar SMTP"
          descricao="Confere se o sistema consegue enviar e-mails pela conta configurada."
          botao="Testar conexão"
          carregando={ocupado === "testar_smtp"}
          onClick={() => executar("testar_smtp", "Teste SMTP")}
        />
      </div>

      {/* ---------- histórico ---------- */}
      <div className="card animate-fade-up">
        <h2 className="mb-4 text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
          Últimas execuções
        </h2>

        {carregando ? (
          <div className="flex items-center justify-center gap-3 py-10 text-sm text-lube-200/55">
            <Loader2 size={18} className="animate-spin" /> Carregando...
          </div>
        ) : execucoes.length === 0 ? (
          <Vazio
            titulo="O robô ainda não rodou"
            descricao="Use os botões acima para executar manualmente, ou aguarde o agendamento automático."
            Icone={Bot}
          />
        ) : (
          <div className="space-y-2">
            {execucoes.map((e) => {
              const aberto = expandido === e.id;
              const itens = (e.detalhes?.itens ?? []) as Array<Record<string, string>>;

              return (
                <div
                  key={e.id}
                  className="rounded-xl border transition"
                  style={{
                    borderColor: e.sucesso === false ? "rgba(238,28,37,.4)" : "var(--color-border-soft)",
                    background: e.sucesso === false ? "rgba(238,28,37,.06)" : "rgba(255,255,255,.025)",
                  }}
                >
                  <button
                    onClick={() => setExpandido(aberto ? null : e.id)}
                    className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
                  >
                    {e.sucesso === false ? (
                      <XCircle size={17} className="shrink-0 text-red-300" />
                    ) : e.finalizado_em ? (
                      <CheckCircle2 size={17} className="shrink-0 text-emerald-300" />
                    ) : (
                      <Loader2 size={17} className="shrink-0 animate-spin text-amber-300" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white">
                        {ROTULO_TIPO[e.tipo] ?? e.tipo}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-lube-200/50">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={10.5} />
                          {dataHora(e.iniciado_em)}
                        </span>
                        {e.emails_lidos > 0 && (
                          <span>
                            {e.emails_lidos} e-mail(s) na janela
                            {e.detalhes?.baixados != null && ` · ${e.detalhes.baixados} baixado(s)`}
                          </span>
                        )}
                        {e.documentos_vinculados > 0 && (
                          <span className="inline-flex items-center gap-1 text-emerald-300/80">
                            <FileCheck2 size={10.5} />
                            {e.documentos_vinculados} documento(s)
                          </span>
                        )}
                        {e.cobrancas_enviadas > 0 && (
                          <span className="text-amber-300/80">{e.cobrancas_enviadas} cobrança(s)</span>
                        )}
                      </div>
                      {e.erro && <div className="mt-1 text-[11px] text-red-300">{e.erro}</div>}
                    </div>

                    {itens.length > 0 && (
                      <Badge classe="border-lube-400/30 bg-lube-500/12 text-lube-100">
                        {aberto ? "ocultar" : `${itens.length} itens`}
                      </Badge>
                    )}
                  </button>

                  {aberto && itens.length > 0 && (
                    <div
                      className="space-y-1.5 border-t px-4 py-3"
                      style={{ borderColor: "var(--color-border-soft)" }}
                    >
                      {itens.map((it, i) => (
                        <div key={i} className="text-xs text-lube-200/70">
                          <span className={it.ok === undefined ? "" : it.ok ? "text-emerald-300" : "text-lube-200/50"}>
                            {it.resultado}
                          </span>
                          {it.assunto && (
                            <span className="ml-1.5 text-lube-200/40">— {it.assunto}</span>
                          )}
                          {it.fornecedor && (
                            <span className="ml-1.5 text-lube-200/40">
                              — {it.fornecedor} / {it.conta}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {aviso && <Aviso tipo={aviso.tipo} mensagem={aviso.mensagem} aoFechar={limpar} />}
    </>
  );
}

function CardAcao({
  Icone,
  cor,
  titulo,
  descricao,
  botao,
  carregando,
  onClick,
  perigo,
}: {
  Icone: React.ComponentType<{ size?: number; className?: string }>;
  cor: string;
  titulo: string;
  descricao: string;
  botao: string;
  carregando: boolean;
  onClick: () => void;
  perigo?: boolean;
}) {
  return (
    <div className="card card-hover card-glow flex flex-col animate-fade-up">
      <div
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ background: `${cor}22`, border: `1px solid ${cor}44` }}
      >
        <Icone size={20} className="text-white/90" />
      </div>
      <h3 className="text-sm font-extrabold text-white">{titulo}</h3>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-lube-200/55">{descricao}</p>
      <BotaoAcao
        carregando={carregando}
        onClick={onClick}
        className={`${perigo ? "btn-danger" : "btn-ghost"} mt-4 w-full !text-xs`}
      >
        {botao}
      </BotaoAcao>
    </div>
  );
}
