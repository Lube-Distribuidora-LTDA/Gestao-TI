"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X, Inbox, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";

/* ---------------- Cabeçalho de página ---------------- */
export function PageHeader({
  titulo,
  descricao,
  acoes,
  icone,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  /**
   * Elemento já renderizado (ex.: `<Wallet size={21} />`), nunca o componente
   * em si. Server Components não conseguem passar uma função como prop para
   * um componente de cliente — só o elemento pronto atravessa essa fronteira.
   */
  icone?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
      <div className="flex items-start gap-3.5">
        {icone && (
          <div
            className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl text-lube-100"
            style={{
              background: "linear-gradient(135deg, rgba(47,60,196,.9), rgba(22,34,95,.9))",
              boxShadow: "0 8px 20px -10px rgba(47,60,196,.9)",
            }}
          >
            {icone}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-[27px]">{titulo}</h1>
          {descricao && <p className="mt-1 max-w-2xl text-sm text-lube-200/65">{descricao}</p>}
        </div>
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

/* ---------------- Card de indicador ---------------- */
export function KpiCard({
  rotulo,
  valor,
  sub,
  icone,
  cor = "#4659e0",
  variacao,
  destaque,
  atraso = 0,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  /** Elemento já renderizado — ver a observação em PageHeader. */
  icone: ReactNode;
  cor?: string;
  variacao?: number | null;
  destaque?: boolean;
  atraso?: number;
}) {
  const Seta = variacao == null ? Minus : variacao > 0 ? TrendingUp : variacao < 0 ? TrendingDown : Minus;

  // Para custo, subir é ruim e cair é bom — o contrário de uma métrica de receita.
  const corVar =
    variacao == null || variacao === 0
      ? "text-lube-300/70"
      : variacao > 0
        ? "text-red-300"
        : "text-emerald-300";

  return (
    <div
      className="card card-hover card-glow animate-fade-up"
      style={{ animationDelay: `${atraso}ms` }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-[0.16] blur-2xl"
        style={{ background: cor }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-lube-300/75">
            {rotulo}
          </div>
          <div
            className={`mt-2 font-extrabold tracking-tight text-white ${
              destaque ? "text-[30px]" : "text-[25px]"
            }`}
          >
            {valor}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {variacao != null && (
              <span className={`inline-flex items-center gap-1 text-xs font-bold ${corVar}`}>
                <Seta size={13} />
                {variacao > 0 ? "+" : ""}
                {variacao.toFixed(1).replace(".", ",")}%
              </span>
            )}
            {sub && <span className="text-xs text-lube-200/55">{sub}</span>}
          </div>
        </div>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/90"
          style={{ background: `${cor}22`, border: `1px solid ${cor}44` }}
        >
          {icone}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Selo de status ---------------- */
export function Badge({
  children,
  classe,
  ponto,
  pulsar,
}: {
  children: ReactNode;
  classe: string;
  ponto?: string;
  pulsar?: boolean;
}) {
  return (
    <span className={`badge ${classe}`}>
      {ponto && (
        <span className={`h-1.5 w-1.5 rounded-full ${ponto} ${pulsar ? "animate-pulse" : ""}`} />
      )}
      {children}
    </span>
  );
}

/* ---------------- Estado vazio ---------------- */
export function Vazio({
  titulo,
  descricao,
  acao,
  Icone = Inbox,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  Icone?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: "rgba(70,89,224,.12)", border: "1px solid rgba(126,148,255,.2)" }}
      >
        <Icone size={28} className="text-lube-300/70" />
      </div>
      <h3 className="text-base font-bold text-white">{titulo}</h3>
      {descricao && <p className="mt-1.5 max-w-sm text-sm text-lube-200/55">{descricao}</p>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  largura = "max-w-2xl",
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  children: ReactNode;
  largura?: string;
}) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={aoFechar} />
      <div
        className={`relative z-10 my-8 w-full ${largura} animate-fade-up rounded-2xl border shadow-2xl`}
        style={{
          borderColor: "var(--color-border-soft)",
          background: "linear-gradient(165deg, rgba(20,31,84,.99), rgba(8,13,40,.99))",
        }}
      >
        <div
          className="flex items-start justify-between gap-4 border-b px-6 py-5"
          style={{ borderColor: "var(--color-border-soft)" }}
        >
          <div>
            <h2 className="text-lg font-extrabold text-white">{titulo}</h2>
            {descricao && <p className="mt-1 text-sm text-lube-200/60">{descricao}</p>}
          </div>
          <button
            onClick={aoFechar}
            className="rounded-lg p-1.5 text-lube-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X size={19} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Aviso / Toast ---------------- */
export type TipoAviso = "sucesso" | "erro" | "info";

export function Aviso({
  tipo,
  mensagem,
  aoFechar,
}: {
  tipo: TipoAviso;
  mensagem: string;
  aoFechar?: () => void;
}) {
  useEffect(() => {
    if (!aoFechar) return;
    const t = setTimeout(aoFechar, tipo === "erro" ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [aoFechar, tipo]);

  const estilos = {
    sucesso: "border-emerald-400/40 bg-emerald-500/12 text-emerald-100",
    erro: "border-[#ee1c25]/45 bg-[#ee1c25]/12 text-red-100",
    info: "border-sky-400/40 bg-sky-500/12 text-sky-100",
  }[tipo];

  return (
    <div
      className={`fixed bottom-5 right-5 z-[80] max-w-md animate-slide-in rounded-xl border px-4 py-3
                  text-sm font-semibold shadow-2xl backdrop-blur-md ${estilos}`}
      role="status"
    >
      <div className="flex items-start gap-3">
        <span className="flex-1 whitespace-pre-wrap">{mensagem}</span>
        {aoFechar && (
          <button onClick={aoFechar} className="shrink-0 opacity-70 hover:opacity-100">
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Hook simples de aviso, usado pelas telas. */
export function useAviso() {
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; mensagem: string } | null>(null);
  return {
    aviso,
    mostrar: (tipo: TipoAviso, mensagem: string) => setAviso({ tipo, mensagem }),
    limpar: () => setAviso(null),
  };
}

/* ---------------- Botão com estado de carregamento ---------------- */
export function BotaoAcao({
  children,
  carregando,
  className = "btn-primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { carregando?: boolean }) {
  return (
    <button {...props} disabled={carregando || props.disabled} className={className}>
      {carregando && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

/* ---------------- Skeleton ---------------- */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}
