"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Send, Loader2, Clock, CheckCircle2, User, Headset, Star, ArrowLeft, Printer,
} from "lucide-react";
import { MarcaLube } from "@/components/LogoLube";
import { Badge } from "@/components/UI";
import { dataHora, data } from "@/lib/format";
import { STATUS_CHAMADO, PRIORIDADE, type StatusChamado, type PrioridadeChamado } from "@/lib/tipos";

type Chamado = {
  id: string;
  protocolo: string;
  titulo: string;
  descricao: string;
  categoria: string;
  prioridade: PrioridadeChamado;
  status: StatusChamado;
  solicitante_nome: string;
  solicitante_setor: string | null;
  aberto_em: string;
  resolvido_em: string | null;
  solucao: string | null;
  responsavel: string | null;
  avaliacao: number | null;
};

type Mensagem = {
  id: string;
  autor: "solicitante" | "tecnico" | "sistema";
  autor_nome: string | null;
  mensagem: string;
  criado_em: string;
};

export default function AcompanharPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [chamado, setChamado] = useState<Chamado | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [avaliando, setAvaliando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/chamados/publico/${token}`);
    const d = await r.json();
    if (r.ok) {
      setChamado(d.chamado);
      setMensagens(d.mensagens);
    } else {
      setErro(d.erro ?? "Chamado não encontrado.");
    }
    setCarregando(false);
  }, [token]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function responder(e: React.FormEvent) {
    e.preventDefault();
    if (texto.trim().length < 2) return;

    setEnviando(true);
    const r = await fetch(`/api/chamados/publico/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagem: texto }),
    });
    setEnviando(false);

    if (r.ok) {
      setTexto("");
      carregar();
    }
  }

  async function avaliar(nota: number) {
    setAvaliando(true);
    await fetch(`/api/chamados/publico/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avaliacao: nota }),
    });
    setAvaliando(false);
    carregar();
  }

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-lube-300" size={32} />
      </div>
    );
  }

  if (erro || !chamado) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card w-full max-w-md text-center">
          <h1 className="text-lg font-extrabold text-white">Chamado não encontrado</h1>
          <p className="mt-2 text-sm text-lube-200/60">{erro}</p>
          <Link href="/abrir-chamado" className="btn-primary mt-5 inline-flex">
            Abrir um chamado
          </Link>
        </div>
      </div>
    );
  }

  const st = STATUS_CHAMADO[chamado.status];
  const pr = PRIORIDADE[chamado.prioridade];
  const encerrado = ["resolvido", "fechado"].includes(chamado.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 animate-fade-up">
        <MarcaLube />
        <div className="flex items-center gap-2 no-print">
          <Link
            href="/abrir-chamado"
            className="inline-flex items-center gap-2 text-sm font-semibold text-lube-300 transition hover:text-white"
          >
            <ArrowLeft size={15} />
            Novo chamado
          </Link>
          <button onClick={() => window.print()} className="btn-ghost !py-1.5 !text-xs">
            <Printer size={14} />
          </button>
        </div>
      </div>

      {/* ---------- cabeçalho ---------- */}
      <div className="card mb-5 animate-fade-up">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-lube-700/60 px-2.5 py-1 text-xs font-extrabold tracking-wide text-lube-100">
                {chamado.protocolo}
              </span>
              <Badge classe={st.classe} ponto={st.ponto} pulsar={chamado.status === "aberto"}>
                {st.label}
              </Badge>
              <Badge classe={pr.classe} ponto={pr.ponto}>{pr.label}</Badge>
            </div>

            <h1 className="mt-3 text-xl font-extrabold text-white sm:text-2xl">{chamado.titulo}</h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-lube-200/55">
              <span className="inline-flex items-center gap-1.5">
                <Clock size={12.5} />
                Aberto em {dataHora(chamado.aberto_em)}
              </span>
              <span>{chamado.categoria}</span>
              {chamado.responsavel && <span>Atendido por {chamado.responsavel}</span>}
            </div>
          </div>
        </div>

        {chamado.resolvido_em && (
          <div
            className="mt-4 flex items-start gap-2.5 rounded-xl border px-4 py-3"
            style={{ borderColor: "rgba(25,158,112,.4)", background: "rgba(25,158,112,.1)" }}
          >
            <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-400" />
            <div>
              <div className="text-sm font-bold text-emerald-100">
                Resolvido em {data(chamado.resolvido_em)}
              </div>
              {chamado.solucao && (
                <p className="mt-1 text-sm text-emerald-200/75">{chamado.solucao}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---------- conversa ---------- */}
      <div className="card mb-5 animate-fade-up" style={{ animationDelay: "80ms" }}>
        <h2 className="mb-4 text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
          Conversa
        </h2>

        <div className="space-y-3">
          {mensagens.map((m) => {
            const daTI = m.autor === "tecnico";
            return (
              <div
                key={m.id}
                className={`flex gap-3 ${daTI ? "" : "flex-row-reverse"}`}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: daTI
                      ? "linear-gradient(135deg,#2f3cc4,#16225f)"
                      : "rgba(255,255,255,.08)",
                  }}
                >
                  {daTI ? (
                    <Headset size={16} className="text-lube-100" />
                  ) : (
                    <User size={16} className="text-lube-200/70" />
                  )}
                </div>

                <div className={`max-w-[80%] ${daTI ? "" : "text-right"}`}>
                  <div
                    className="rounded-2xl border px-4 py-2.5 text-left"
                    style={{
                      borderColor: daTI ? "rgba(47,60,196,.45)" : "var(--color-border-soft)",
                      background: daTI ? "rgba(47,60,196,.16)" : "rgba(255,255,255,.04)",
                    }}
                  >
                    <div className="mb-1 text-[11px] font-bold text-lube-300/85">
                      {daTI ? m.autor_nome || "Equipe de TI" : m.autor_nome || "Você"}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-lube-50">
                      {m.mensagem}
                    </p>
                  </div>
                  <div className="mt-1 px-1 text-[11px] text-lube-200/40">
                    {dataHora(m.criado_em)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* responder */}
        {chamado.status !== "fechado" && chamado.status !== "cancelado" && (
          <form onSubmit={responder} className="mt-5 border-t pt-4 no-print" style={{ borderColor: "var(--color-border-soft)" }}>
            <label className="label">
              {encerrado ? "Ainda com problema? Responda aqui para reabrir" : "Responder à TI"}
            </label>
            <textarea
              className="input min-h-[90px]"
              placeholder="Escreva sua mensagem..."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <div className="mt-3 flex justify-end">
              <button type="submit" disabled={enviando || texto.trim().length < 2} className="btn-primary">
                {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Enviar resposta
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ---------- avaliação ---------- */}
      {encerrado && (
        <div className="card animate-fade-up no-print" style={{ animationDelay: "140ms" }}>
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
            Como foi o atendimento?
          </h2>

          {chamado.avaliacao ? (
            <div className="mt-3 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  size={22}
                  className={n <= chamado.avaliacao! ? "fill-amber-400 text-amber-400" : "text-lube-300/30"}
                />
              ))}
              <span className="ml-2 text-sm text-lube-200/60">Obrigado pela avaliação!</span>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => avaliar(n)}
                  disabled={avaliando}
                  className="transition hover:scale-110 disabled:opacity-50"
                  title={`${n} estrela${n > 1 ? "s" : ""}`}
                >
                  <Star size={26} className="text-lube-300/40 transition hover:text-amber-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-lube-200/35">
        Departamento de Tecnologia da Informação · Lube Distribuidora
      </p>
    </div>
  );
}
