"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LifeBuoy, Send, CheckCircle2, Copy, Loader2, Search, AlertTriangle, ArrowRight,
} from "lucide-react";
import { MarcaLube } from "@/components/LogoLube";
import { CATEGORIAS_CHAMADO, SETORES, PRIORIDADE, type PrioridadeChamado } from "@/lib/tipos";

const VAZIO = {
  solicitante_nome: "",
  solicitante_email: "",
  solicitante_setor: "",
  solicitante_ramal: "",
  categoria: "Outros" as string,
  titulo: "",
  descricao: "",
  equipamento: "",
  localizacao: "",
  prioridade: "media" as PrioridadeChamado,
};

export default function AbrirChamadoPage() {
  const [form, setForm] = useState({ ...VAZIO });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<{ protocolo: string; token: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);

    try {
      const r = await fetch("/api/chamados/publico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();

      if (r.ok) setSucesso({ protocolo: d.protocolo, token: d.token });
      else setErro(d.erro ?? "Não foi possível registrar o chamado.");
    } catch {
      setErro("Falha de conexão. Verifique sua rede e tente de novo.");
    }
    setEnviando(false);
  }

  /* ---------------- Tela de sucesso ---------------- */
  if (sucesso) {
    const link = `${window.location.origin}/acompanhar/${sucesso.token}`;
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg animate-fade-up">
          <div className="mb-8 flex justify-center">
            <MarcaLube />
          </div>

          <div className="card text-center">
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ background: "rgba(25,158,112,.16)", border: "1px solid rgba(25,158,112,.4)" }}
            >
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>

            <h1 className="text-xl font-extrabold text-white">Chamado registrado!</h1>
            <p className="mt-2 text-sm text-lube-200/65">
              Nossa equipe já foi avisada. Enviamos a confirmação para{" "}
              <strong className="text-white">{form.solicitante_email}</strong>.
            </p>

            <div
              className="my-6 rounded-2xl px-6 py-5"
              style={{ background: "linear-gradient(135deg,#1e2f8f,#0e1742)" }}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-lube-300/85">
                Seu protocolo
              </div>
              <div className="mt-1.5 text-3xl font-extrabold tracking-wider text-white">
                {sucesso.protocolo}
              </div>
            </div>

            <p className="mb-2 text-xs text-lube-200/55">
              Guarde este link para acompanhar e responder:
            </p>
            <div className="flex items-center gap-2">
              <input className="input !text-xs" readOnly value={link} onFocus={(e) => e.target.select()} />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2200);
                }}
                className="btn-ghost shrink-0"
                title="Copiar link"
              >
                {copiado ? <CheckCircle2 size={15} className="text-emerald-400" /> : <Copy size={15} />}
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link href={`/acompanhar/${sucesso.token}`} className="btn-primary flex-1">
                Acompanhar chamado <ArrowRight size={15} />
              </Link>
              <button
                onClick={() => {
                  setSucesso(null);
                  setForm({ ...VAZIO });
                }}
                className="btn-ghost flex-1"
              >
                Abrir outro chamado
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- Formulário ---------------- */
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 animate-fade-up">
        <MarcaLube />
        <Link
          href="/acompanhar"
          className="inline-flex items-center gap-2 text-sm font-semibold text-lube-300 transition hover:text-white"
        >
          <Search size={15} />
          Acompanhar um chamado
        </Link>
      </div>

      <div className="mb-6 animate-fade-up">
        <div className="flex items-start gap-3.5">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg,#2f3cc4,#16225f)",
              boxShadow: "0 8px 22px -10px rgba(47,60,196,.95)",
            }}
          >
            <LifeBuoy size={23} className="text-lube-100" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Suporte de TI
            </h1>
            <p className="mt-1 text-sm text-lube-200/65">
              Conte o que está acontecendo. A equipe recebe na hora e responde por e-mail.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={enviar} className="card animate-fade-up" style={{ animationDelay: "80ms" }}>
        {/* quem é você */}
        <h2 className="mb-4 text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
          Seus dados
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Nome completo *</label>
            <input
              className="input"
              required
              minLength={3}
              placeholder="Como devemos te chamar"
              value={form.solicitante_nome}
              onChange={(e) => setForm({ ...form, solicitante_nome: e.target.value })}
            />
          </div>
          <div>
            <label className="label">E-mail *</label>
            <input
              type="email"
              className="input"
              required
              placeholder="seunome@lube.com.br"
              value={form.solicitante_email}
              onChange={(e) => setForm({ ...form, solicitante_email: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-lube-200/45">É por aqui que responderemos você.</p>
          </div>
          <div>
            <label className="label">Setor</label>
            <select
              className="input"
              value={form.solicitante_setor}
              onChange={(e) => setForm({ ...form, solicitante_setor: e.target.value })}
            >
              <option value="">Selecione...</option>
              {SETORES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Ramal / telefone</label>
            <input
              className="input"
              placeholder="ex.: 2145"
              value={form.solicitante_ramal}
              onChange={(e) => setForm({ ...form, solicitante_ramal: e.target.value })}
            />
          </div>
        </div>

        {/* o problema */}
        <h2 className="mb-4 mt-7 text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
          O problema
        </h2>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Tipo de problema *</label>
              <select
                className="input"
                required
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              >
                {CATEGORIAS_CHAMADO.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Urgência</label>
              <select
                className="input"
                value={form.prioridade}
                onChange={(e) => setForm({ ...form, prioridade: e.target.value as PrioridadeChamado })}
              >
                <option value="baixa">Baixa — posso esperar</option>
                <option value="media">Média — atrapalha meu trabalho</option>
                <option value="alta">Alta — não consigo trabalhar</option>
                <option value="critica">Crítica — parou o setor todo</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Resumo *</label>
            <input
              className="input"
              required
              minLength={5}
              maxLength={180}
              placeholder="ex.: Impressora do faturamento não imprime"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Descrição detalhada *</label>
            <textarea
              className="input min-h-[130px]"
              required
              minLength={10}
              maxLength={5000}
              placeholder={
                "Conte com detalhes:\n" +
                "• O que você estava fazendo quando aconteceu?\n" +
                "• Aparece alguma mensagem de erro? Qual?\n" +
                "• Desde quando está assim?"
              }
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-lube-200/45">
              Quanto mais detalhes, mais rápido conseguimos resolver.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Equipamento</label>
              <input
                className="input"
                placeholder="ex.: PC-FAT-03, impressora HP do 2º andar"
                value={form.equipamento}
                onChange={(e) => setForm({ ...form, equipamento: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Onde você está</label>
              <input
                className="input"
                placeholder="ex.: Matriz — sala do faturamento"
                value={form.localizacao}
                onChange={(e) => setForm({ ...form, localizacao: e.target.value })}
              />
            </div>
          </div>
        </div>

        {form.prioridade === "critica" && (
          <div
            className="mt-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: "rgba(238,28,37,.45)", background: "rgba(238,28,37,.1)" }}
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-300" />
            <span className="text-red-100">
              Você marcou como <strong>crítica</strong>. Se algo parou de vez e não pode esperar,
              ligue também para o ramal da TI — o chamado fica registrado do mesmo jeito.
            </span>
          </div>
        )}

        {erro && (
          <div
            className="mt-5 rounded-xl border px-4 py-3 text-sm font-semibold text-red-100"
            style={{ borderColor: "rgba(238,28,37,.45)", background: "rgba(238,28,37,.12)" }}
          >
            {erro}
          </div>
        )}

        <div
          className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5"
          style={{ borderColor: "var(--color-border-soft)" }}
        >
          <p className="text-xs text-lube-200/45">* campos obrigatórios</p>
          <button type="submit" disabled={enviando} className="btn-primary min-w-[190px]">
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {enviando ? "Enviando..." : "Abrir chamado"}
          </button>
        </div>
      </form>

      <p className="mt-6 text-center text-xs text-lube-200/35">
        Departamento de Tecnologia da Informação · Lube Distribuidora
      </p>
    </div>
  );
}
