"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
            className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl text-[var(--ouro)]"
            style={{
              background: "linear-gradient(135deg, var(--ouro-dim), transparent), var(--s1)",
              border: "1px solid var(--ouro-linha)",
              boxShadow: "var(--sombra)",
            }}
          >
            {icone}
          </div>
        )}
        <div>
          <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-[-0.01em] text-[var(--t1)] sm:text-[24px]">
            {titulo}
          </h1>
          {descricao && <p className="mt-1 max-w-2xl text-[13px] text-[var(--t3)]">{descricao}</p>}
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
      ? "text-[var(--t3)]"
      : variacao > 0
        ? "text-[var(--perigo)]"
        : "text-[var(--ok)]";

  // Card zerado fica cinza (padrão dos sistemas): zero não pede atenção nenhuma.
  const zero = /^(R\$\s*)?0([.,]0+)?$/.test(valor.trim());
  const corIcone = zero ? "var(--t3)" : destaque ? "var(--ouro)" : cor;

  return (
    <div
      className="card card-hover card-glow animate-fade-up"
      style={{
        animationDelay: `${atraso}ms`,
        ...(destaque && !zero
          ? {
              borderColor: "var(--ouro-linha)",
              background: "linear-gradient(135deg, rgba(233,200,119,.1), transparent 55%), var(--s1)",
            }
          : {}),
      }}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-[130px] w-[130px] rounded-full"
        style={{
          background: `radial-gradient(closest-side, ${
            zero ? "transparent" : destaque ? "rgba(233,200,119,.28)" : `${cor}38`
          }, transparent)`,
        }}
      />
      {/* ícone na linha do rótulo, como no Fiscal: o valor fica com a largura toda do card */}
      <div className="relative min-w-0">
        <div className="flex items-center gap-[9px] text-[11px] font-bold uppercase tracking-[0.13em] text-[var(--t3)]">
          <span
            className="flex shrink-0 [&>svg]:h-[17px] [&>svg]:w-[17px]"
            style={{ color: corIcone }}
          >
            {icone}
          </span>
          <span className="truncate">{rotulo}</span>
        </div>
        <div
          className={`num mt-2.5 truncate font-extrabold leading-[1.1] tracking-[-0.02em] ${
            destaque ? "text-[clamp(21px,1.9vw,28px)]" : "text-[clamp(19px,1.65vw,24px)]"
          } ${zero ? "text-[var(--t3)]" : "text-[var(--t1)]"}`}
          style={
            destaque && !zero
              ? {
                  background: "linear-gradient(180deg, var(--ouro-forte), var(--ouro))",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }
              : undefined
          }
        >
          {valor}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {variacao != null && (
            <span className={`num inline-flex items-center gap-1 text-xs font-bold ${corVar}`}>
              <Seta size={13} />
              {variacao > 0 ? "+" : ""}
              {variacao.toFixed(1).replace(".", ",")}%
            </span>
          )}
          {sub && <span className="text-xs text-[var(--t3)]">{sub}</span>}
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
        style={{ background: "var(--s2)", border: "1px solid var(--linha)" }}
      >
        <Icone size={28} className="text-[var(--t3)]" />
      </div>
      <h3 className="font-display text-[14px] font-bold text-[var(--t2)]">{titulo}</h3>
      {descricao && <p className="mt-1.5 max-w-sm text-[13px] text-[var(--t3)]">{descricao}</p>}
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

  /*
   * Vai por portal para o <body>. Os cards animam com transform (animate-fade-up, que fica
   * aplicado depois da animação), e um position:fixed dentro de um ancestral com transform
   * se posiciona pelo ancestral, não pela janela: um modal aberto de dentro de um card
   * apareceria preso nele.
   */
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={aoFechar} />
      <div
        className={`relative z-10 my-8 w-full ${largura} animate-fade-up rounded-2xl border shadow-2xl`}
        style={{
          borderColor: "var(--color-border-soft)",
          background: "var(--s1)",
          boxShadow: "0 30px 70px -20px rgba(0,0,0,.8)",
        }}
      >
        <div
          className="flex items-start justify-between gap-4 border-b px-6 py-5"
          style={{ borderColor: "var(--color-border-soft)" }}
        >
          <div>
            <h2 className="titulo-secao">{titulo}</h2>
            {descricao && <p className="mt-1.5 text-[13px] text-[var(--t3)]">{descricao}</p>}
          </div>
          <button
            onClick={aoFechar}
            className="rounded-lg p-1.5 text-[var(--t3)] transition hover:bg-[var(--luz)] hover:text-[var(--ouro-forte)]"
            aria-label="Fechar"
          >
            <X size={19} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body
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
    // ~4 s, como nos outros sistemas; erro fica mais, para dar tempo de ler
    const t = setTimeout(aoFechar, tipo === "erro" ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [aoFechar, tipo]);

  const corBarra = { sucesso: "var(--ok)", erro: "var(--perigo)", info: "var(--ouro)" }[tipo];

  return (
    <div
      className="fixed bottom-[22px] right-[22px] z-[80] min-w-[240px] max-w-[380px] animate-slide-in rounded-xl border px-4 py-3
                 text-[13px] font-semibold text-[var(--t1)]"
      style={{
        background: "var(--s-sobe)",
        borderColor: "var(--ouro-linha)",
        borderLeft: `4px solid ${corBarra}`,
        boxShadow: "0 24px 50px -16px rgba(0,0,0,.7)",
      }}
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

  /*
   * `mostrar` e `limpar` precisam manter a identidade entre renders. Sem o
   * useCallback, uma tela que coloque `mostrar` nas dependências de um
   * useCallback/useEffect de carga entra em laço: a função nova a cada render
   * invalida o efeito, que busca, que renderiza, que cria a função de novo.
   * Aconteceu no quadro do Kanban — 465 chamadas à API em poucos segundos.
   */
  const mostrar = useCallback((tipo: TipoAviso, mensagem: string) => {
    setAviso({ tipo, mensagem });
  }, []);
  const limpar = useCallback(() => setAviso(null), []);

  return { aviso, mostrar, limpar };
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
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`skeleton rounded-lg ${className}`} style={style} />;
}
