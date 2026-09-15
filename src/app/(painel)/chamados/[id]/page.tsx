"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Send, Loader2, User, Headset, Lock, Mail, CheckCircle2, Copy,
  Star, Printer, MapPin, Monitor, Phone,
} from "lucide-react";
import { PageHeader, Badge, Aviso, useAviso, BotaoAcao } from "@/components/UI";
import { dataHora, data } from "@/lib/format";
import {
  STATUS_CHAMADO, PRIORIDADE, CATEGORIAS_CHAMADO,
  type StatusChamado, type PrioridadeChamado,
} from "@/lib/tipos";

type Chamado = {
  id: string;
  protocolo: string;
  titulo: string;
  descricao: string;
  categoria: string;
  prioridade: PrioridadeChamado;
  status: StatusChamado;
  solicitante_nome: string;
  solicitante_email: string;
  solicitante_setor: string | null;
  solicitante_ramal: string | null;
  equipamento: string | null;
  localizacao: string | null;
  responsavel: string | null;
  token_acesso: string;
  aberto_em: string;
  primeira_resposta_em: string | null;
  resolvido_em: string | null;
  solucao: string | null;
  avaliacao: number | null;
};

type Mensagem = {
  id: string;
  autor: "solicitante" | "tecnico" | "sistema";
  autor_nome: string | null;
  mensagem: string;
  interna: boolean;
  criado_em: string;
};

export default function DetalheChamadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { aviso, mostrar, limpar } = useAviso();

  const [chamado, setChamado] = useState<Chamado | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState("");
  const [interna, setInterna] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [solucao, setSolucao] = useState("");

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/chamados/${id}`);
    const d = await r.json();
    if (r.ok) {
      setChamado(d.chamado);
      setMensagens(d.mensagens);
      setSolucao(d.chamado.solucao ?? "");
    } else {
      mostrar("erro", d.erro ?? "Chamado não encontrado.");
    }
    setCarregando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function responder(e: React.FormEvent) {
    e.preventDefault();
    if (texto.trim().length < 2) return;

    setEnviando(true);
    const r = await fetch(`/api/chamados/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagem: texto, interna }),
    });
    const d = await r.json();
    setEnviando(false);

    if (r.ok) {
      setTexto("");
      mostrar(
        "sucesso",
        interna
          ? "Anotação interna salva (o solicitante não vê)."
          : d.emailEnviado
            ? "Resposta enviada e e-mail entregue ao solicitante."
            : "Resposta registrada, mas o e-mail não pôde ser enviado. Verifique o SMTP."
      );
      carregar();
    } else {
      mostrar("erro", d.erro ?? "Não foi possível enviar.");
    }
  }

  async function atualizar(patch: Record<string, unknown>, msg: string) {
    setSalvando(true);
    const r = await fetch(`/api/chamados/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const d = await r.json();
    setSalvando(false);

    if (r.ok) {
      mostrar("sucesso", msg);
      carregar();
    } else {
      mostrar("erro", d.erro ?? "Não foi possível atualizar.");
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-sm text-lube-200/55">
        <Loader2 size={20} className="animate-spin" /> Carregando chamado...
      </div>
    );
  }
  if (!chamado) {
    return (
      <div className="card text-center">
        <p className="text-sm text-lube-200/60">Chamado não encontrado.</p>
        <Link href="/chamados" className="btn-primary mt-4 inline-flex">Voltar</Link>
      </div>
    );
  }

  const st = STATUS_CHAMADO[chamado.status];
  const pr = PRIORIDADE[chamado.prioridade];

  return (
    <>
      <div className="mb-5 no-print">
        <Link
          href="/chamados"
          className="inline-flex items-center gap-2 text-sm font-semibold text-lube-300 transition hover:text-white"
        >
          <ArrowLeft size={15} />
          Voltar para a lista
        </Link>
      </div>

      <PageHeader
        titulo={chamado.titulo}
        descricao={`${chamado.protocolo} · aberto em ${dataHora(chamado.aberto_em)}`}
        acoes={
          <>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/acompanhar/${chamado.token_acesso}`);
                mostrar("sucesso", "Link de acompanhamento copiado.");
              }}
              className="btn-ghost"
            >
              <Copy size={15} />
              Link do solicitante
            </button>
            <button onClick={() => window.print()} className="btn-ghost">
              <Printer size={15} />
            </button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ---------- coluna principal ---------- */}
        <div className="space-y-5 lg:col-span-2">
          {/* descrição original */}
          <div className="card animate-fade-up">
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
              Relato do solicitante
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-lube-50">
              {chamado.descricao}
            </p>

            <div
              className="mt-4 grid gap-3 border-t pt-4 text-xs sm:grid-cols-2"
              style={{ borderColor: "var(--color-border-soft)" }}
            >
              {chamado.equipamento && (
                <div className="flex items-center gap-2 text-lube-200/70">
                  <Monitor size={13} className="text-lube-300/70" />
                  {chamado.equipamento}
                </div>
              )}
              {chamado.localizacao && (
                <div className="flex items-center gap-2 text-lube-200/70">
                  <MapPin size={13} className="text-lube-300/70" />
                  {chamado.localizacao}
                </div>
              )}
              {chamado.solicitante_ramal && (
                <div className="flex items-center gap-2 text-lube-200/70">
                  <Phone size={13} className="text-lube-300/70" />
                  Ramal {chamado.solicitante_ramal}
                </div>
              )}
              <div className="flex items-center gap-2 text-lube-200/70">
                <Mail size={13} className="text-lube-300/70" />
                {chamado.solicitante_email}
              </div>
            </div>
          </div>

          {/* conversa */}
          <div className="card animate-fade-up" style={{ animationDelay: "80ms" }}>
            <h2 className="mb-4 text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
              Conversa ({mensagens.length})
            </h2>

            <div className="space-y-3">
              {mensagens.map((m) => {
                const daTI = m.autor === "tecnico";
                return (
                  <div key={m.id} className={`flex gap-3 ${daTI ? "flex-row-reverse" : ""}`}>
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: m.interna
                          ? "rgba(201,133,0,.22)"
                          : daTI
                            ? "linear-gradient(135deg,#2f3cc4,#16225f)"
                            : "rgba(255,255,255,.08)",
                      }}
                    >
                      {m.interna ? (
                        <Lock size={15} className="text-amber-300" />
                      ) : daTI ? (
                        <Headset size={16} className="text-lube-100" />
                      ) : (
                        <User size={16} className="text-lube-200/70" />
                      )}
                    </div>

                    <div className="max-w-[82%]">
                      <div
                        className="rounded-2xl border px-4 py-2.5"
                        style={{
                          borderColor: m.interna
                            ? "rgba(201,133,0,.4)"
                            : daTI
                              ? "rgba(47,60,196,.45)"
                              : "var(--color-border-soft)",
                          background: m.interna
                            ? "rgba(201,133,0,.09)"
                            : daTI
                              ? "rgba(47,60,196,.16)"
                              : "rgba(255,255,255,.04)",
                        }}
                      >
                        <div className="mb-1 flex items-center gap-2 text-[11px] font-bold text-lube-300/85">
                          {m.autor_nome || (daTI ? "Equipe de TI" : chamado.solicitante_nome)}
                          {m.interna && (
                            <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[9px] text-amber-200">
                              INTERNA
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-lube-50">
                          {m.mensagem}
                        </p>
                      </div>
                      <div className={`mt-1 px-1 text-[11px] text-lube-200/40 ${daTI ? "text-right" : ""}`}>
                        {dataHora(m.criado_em)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <form
              onSubmit={responder}
              className="mt-5 border-t pt-4 no-print"
              style={{ borderColor: "var(--color-border-soft)" }}
            >
              <textarea
                className="input min-h-[110px]"
                placeholder={
                  interna
                    ? "Anotação interna — o solicitante não verá esta mensagem..."
                    : "Sua resposta será enviada por e-mail para o solicitante..."
                }
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-lube-100">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#c98500]"
                    checked={interna}
                    onChange={(e) => setInterna(e.target.checked)}
                  />
                  <Lock size={13} className="text-amber-300" />
                  Anotação interna
                </label>

                <BotaoAcao
                  type="submit"
                  carregando={enviando}
                  disabled={texto.trim().length < 2}
                  className={interna ? "btn-ghost" : "btn-primary"}
                >
                  <Send size={15} />
                  {interna ? "Salvar anotação" : "Responder e notificar"}
                </BotaoAcao>
              </div>
            </form>
          </div>
        </div>

        {/* ---------- coluna lateral ---------- */}
        <div className="space-y-5">
          <div className="card animate-fade-up" style={{ animationDelay: "120ms" }}>
            <h2 className="mb-4 text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
              Situação
            </h2>

            <div className="mb-4 flex flex-wrap gap-2">
              <Badge classe={st.classe} ponto={st.ponto} pulsar={chamado.status === "aberto"}>
                {st.label}
              </Badge>
              <Badge classe={pr.classe} ponto={pr.ponto}>{pr.label}</Badge>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label">Situação</label>
                <select
                  className="input"
                  value={chamado.status}
                  disabled={salvando}
                  onChange={(e) => atualizar({ status: e.target.value }, "Situação atualizada.")}
                >
                  {Object.entries(STATUS_CHAMADO).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Prioridade</label>
                <select
                  className="input"
                  value={chamado.prioridade}
                  disabled={salvando}
                  onChange={(e) => atualizar({ prioridade: e.target.value }, "Prioridade atualizada.")}
                >
                  {Object.entries(PRIORIDADE).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Categoria</label>
                <select
                  className="input"
                  value={chamado.categoria}
                  disabled={salvando}
                  onChange={(e) => atualizar({ categoria: e.target.value }, "Categoria atualizada.")}
                >
                  {CATEGORIAS_CHAMADO.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  {!CATEGORIAS_CHAMADO.includes(chamado.categoria as never) && (
                    <option value={chamado.categoria}>{chamado.categoria}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="label">Responsável</label>
                <input
                  className="input"
                  defaultValue={chamado.responsavel ?? ""}
                  placeholder="Quem está atendendo"
                  onBlur={(e) => {
                    if (e.target.value !== (chamado.responsavel ?? "")) {
                      atualizar({ responsavel: e.target.value || null }, "Responsável atualizado.");
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* resolução */}
          <div className="card animate-fade-up" style={{ animationDelay: "160ms" }}>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
              Resolução
            </h2>

            <textarea
              className="input min-h-[100px]"
              placeholder="Descreva o que foi feito para resolver..."
              value={solucao}
              onChange={(e) => setSolucao(e.target.value)}
            />

            <BotaoAcao
              carregando={salvando}
              onClick={() =>
                atualizar(
                  { status: "resolvido", solucao },
                  "Chamado resolvido e solicitante avisado por e-mail."
                )
              }
              disabled={chamado.status === "resolvido" || chamado.status === "fechado"}
              className="btn-primary mt-3 w-full"
            >
              <CheckCircle2 size={15} />
              Marcar como resolvido
            </BotaoAcao>

            {chamado.resolvido_em && (
              <p className="mt-3 text-center text-xs text-emerald-300">
                Resolvido em {data(chamado.resolvido_em)}
              </p>
            )}

            {chamado.avaliacao && (
              <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--color-border-soft)" }}>
                <div className="mb-1.5 text-xs font-bold text-lube-300/85">Avaliação do solicitante</div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      size={17}
                      className={n <= chamado.avaliacao! ? "fill-amber-400 text-amber-400" : "text-lube-300/25"}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* linha do tempo */}
          <div className="card animate-fade-up" style={{ animationDelay: "200ms" }}>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
              Linha do tempo
            </h2>
            <div className="space-y-2.5 text-xs">
              <Marco rotulo="Aberto" valor={dataHora(chamado.aberto_em)} cor="#3987e5" />
              <Marco
                rotulo="Primeira resposta"
                valor={chamado.primeira_resposta_em ? dataHora(chamado.primeira_resposta_em) : "—"}
                cor="#c98500"
              />
              <Marco
                rotulo="Resolvido"
                valor={chamado.resolvido_em ? dataHora(chamado.resolvido_em) : "—"}
                cor="#199e70"
              />
            </div>
          </div>
        </div>
      </div>

      {aviso && <Aviso tipo={aviso.tipo} mensagem={aviso.mensagem} aoFechar={limpar} />}
    </>
  );
}

function Marco({ rotulo, valor, cor }: { rotulo: string; valor: string; cor: string }) {
  const vazio = valor === "—";
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: vazio ? "rgba(126,148,255,.2)" : cor, outline: "2px solid #0e1742" }}
      />
      <span className="text-lube-200/60">{rotulo}</span>
      <span className={`ml-auto font-semibold ${vazio ? "text-lube-200/30" : "text-white"}`}>
        {valor}
      </span>
    </div>
  );
}
