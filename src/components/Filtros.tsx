"use client";

/*
 * Faixa de filtros — o padrão "Filtro de chips" dos sistemas recentes da Lube
 * (Cérebro › Como eu gosto dos BIs; implementação de referência no Fiscal, js/filtros.js).
 *
 * Regra da casa: a partir de "Todos", o clique seleciona só aquela opção; depois cada
 * clique soma ou tira; esvaziar volta para "Todos" (lista vazia = sem filtro).
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, SlidersHorizontal, Search, X, CalendarDays } from "lucide-react";

export type OpcaoFiltro = { id: string; nome: string; sub?: string; cor?: string };

/* ---------------- texto sem acento, para a busca achar "manutencao" em "Manutenção" ---------------- */
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Destaca, com <mark>, o trecho que a busca achou. */
function Destacado({ texto, termos }: { texto: string; termos: string[] }) {
  if (!termos.length) return <>{texto}</>;
  const n = norm(texto);
  const marcas = termos
    .map((t) => [n.indexOf(t), n.indexOf(t) + t.length] as const)
    .filter(([i]) => i >= 0)
    .sort((a, b) => a[0] - b[0]);
  const partes: ReactNode[] = [];
  let pos = 0;
  marcas.forEach(([i, f], k) => {
    if (i < pos) return;
    partes.push(texto.slice(pos, i), <mark key={k}>{texto.slice(i, f)}</mark>);
    pos = f;
  });
  partes.push(texto.slice(pos));
  return <>{partes}</>;
}

/* ---------------- popover ancorado num botão ---------------- */
/*
 * Vai por portal para o <body>: os cards das telas animam com transform, e um
 * position:fixed dentro de um ancestral com transform passa a se posicionar
 * pelo ancestral, não pela janela — a lista abriria no lugar errado.
 */
function Popover({
  ancora,
  largura = 320,
  aoFechar,
  children,
}: {
  ancora: HTMLElement;
  largura?: number;
  aoFechar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const r = ancora.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(window.innerWidth - largura - 8, r.left)),
      top: Math.min(r.bottom + 6, window.innerHeight - 120),
    });
  }, [ancora, largura]);

  useEffect(() => {
    const fora = (ev: MouseEvent) => {
      const alvo = ev.target as Node;
      if (!ref.current?.contains(alvo) && !ancora.contains(alvo)) aoFechar();
    };
    const tecla = (ev: KeyboardEvent) => ev.key === "Escape" && aoFechar();
    // rolar a página descola a lista do botão; fecha em vez de ficar flutuando
    const rolou = (ev: Event) => {
      if (!ref.current?.contains(ev.target as Node)) aoFechar();
    };
    document.addEventListener("mousedown", fora, true);
    document.addEventListener("keydown", tecla, true);
    window.addEventListener("scroll", rolou, true);
    return () => {
      document.removeEventListener("mousedown", fora, true);
      document.removeEventListener("keydown", tecla, true);
      window.removeEventListener("scroll", rolou, true);
    };
  }, [ancora, aoFechar]);

  if (!pos) return null;
  return createPortal(
    <div ref={ref} className="pop" style={{ left: pos.left, top: pos.top, width: largura }}>
      {children}
    </div>,
    document.body
  );
}

/* ---------------- faixa ---------------- */
export function FaixaFiltros({
  children,
  pilulas = [],
  aoLimpar,
  direita,
}: {
  children: ReactNode;
  /** Uma pílula por valor escolhido; o X remove só aquele valor. */
  pilulas?: Array<{ rotulo: string; texto: string; remover: () => void }>;
  /** Some quando não há filtro ativo. */
  aoLimpar?: () => void;
  /** Conteúdo encostado à direita (total listado, botões da tela). */
  direita?: ReactNode;
}) {
  return (
    <div className="faixa-filtros no-print">
      <span className="fx-rot">
        <SlidersHorizontal size={14} /> Filtros
      </span>
      {children}
      {aoLimpar && pilulas.length > 0 ? (
        <button type="button" className="fx-limpar" onClick={aoLimpar}>
          Limpar filtros
        </button>
      ) : (
        <span className="ml-auto" />
      )}
      {direita}
      {pilulas.length > 0 && (
        <div className="fx-pilulas">
          {pilulas.map((p, i) => (
            <span key={`${p.rotulo}-${p.texto}-${i}`} className="pilula">
              <b>{p.rotulo}</b>
              <span title={p.texto}>{p.texto}</span>
              <button type="button" title="Remover" onClick={p.remover}>
                <X size={10} strokeWidth={3} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- segmento (períodos rápidos, atalhos de escolha única) ---------------- */
export function Segmento<V extends string>({
  opcoes,
  valor,
  aoMudar,
}: {
  opcoes: Array<{ v: V; rotulo: string; n?: number; titulo?: string }>;
  valor: V | null;
  aoMudar: (v: V) => void;
}) {
  return (
    <div className="seg" role="group">
      {opcoes.map((o) => (
        <button
          key={o.v}
          type="button"
          title={o.titulo}
          className={valor === o.v ? "on" : ""}
          onClick={() => aoMudar(o.v)}
        >
          {o.rotulo}
          {o.n != null && <span className="n">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------------- busca livre ---------------- */
export function BuscaFiltro({
  valor,
  aoMudar,
  placeholder = "Buscar…",
}: {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="fx-busca">
      <Search size={14} />
      <input
        type="search"
        value={valor}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => aoMudar(e.target.value)}
      />
    </label>
  );
}

/* ---------------- escolha múltipla com busca ---------------- */
export function FiltroMulti({
  rotulo,
  opcoes,
  selecionados,
  aoMudar,
}: {
  rotulo: string;
  opcoes: OpcaoFiltro[];
  selecionados: string[];
  aoMudar: (ids: string[]) => void;
}) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const [q, setQ] = useState("");
  const n = selecionados.length;

  const termos = norm(q).split(/\s+/).filter(Boolean);
  const achados = termos.length
    ? opcoes.filter((o) => termos.every((t) => norm(`${o.nome} ${o.sub ?? ""}`).includes(t)))
    : opcoes;
  const conj = new Set(selecionados);
  // marcados primeiro: o que já foi escolhido não se perde no meio da lista
  const ordenados = [...achados.filter((o) => conj.has(o.id)), ...achados.filter((o) => !conj.has(o.id))];

  const alternar = (id: string) =>
    aoMudar(conj.has(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id]);

  const fechar = () => {
    setAncora(null);
    setQ("");
  };

  return (
    <>
      <button
        type="button"
        className={`fx-btn${n ? " on" : ""}`}
        onClick={(e) => (ancora ? fechar() : setAncora(e.currentTarget))}
      >
        <span>{rotulo}</span>
        {n > 0 && <span className="n">{n}</span>}
        <ChevronDown size={12} strokeWidth={2.4} className="opacity-70" />
      </button>
      {ancora && (
        <Popover ancora={ancora} aoFechar={fechar}>
          {opcoes.length > 10 && (
            <div className="pop-topo">
              <input
                type="search"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder={`Buscar ${rotulo.toLowerCase()}…`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          )}
          <div className="pop-lista">
            {ordenados.length === 0 && <div className="pop-vazio">Nada encontrado</div>}
            {ordenados.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`pop-item${conj.has(o.id) ? " on" : ""}`}
                onClick={() => alternar(o.id)}
              >
                <span className="cx" />
                {o.cor && <span className="bolinha" style={{ background: o.cor }} />}
                <span className="tx" title={o.nome}>
                  <Destacado texto={o.nome} termos={termos} />
                </span>
                {o.sub && <span className="cn">{o.sub}</span>}
              </button>
            ))}
          </div>
          <div className="pop-rodape">
            <span>{n ? `${n} selecionado${n > 1 ? "s" : ""}` : "Todos"}</span>
            <span className="flex gap-1.5">
              {termos.length > 0 && achados.length > 1 && (
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => aoMudar([...new Set([...selecionados, ...achados.map((o) => o.id)])])}
                >
                  Marcar os {achados.length}
                </button>
              )}
              <button type="button" className="mini-btn" onClick={() => aoMudar([])}>
                Limpar
              </button>
            </span>
          </div>
        </Popover>
      )}
    </>
  );
}

/* ---------------- intervalo de datas livre ---------------- */
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const isoDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const dataCurta = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
};

export function FiltroDatas({
  de,
  ate,
  aoAplicar,
  ativo,
  rotuloVazio = "Datas",
}: {
  de: string;
  ate: string;
  aoAplicar: (de: string, ate: string) => void;
  /** Aceso quando o período veio das datas livres, não de um atalho. */
  ativo: boolean;
  rotuloVazio?: string;
}) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const [d1, setD1] = useState(de);
  const [d2, setD2] = useState(ate);

  // os 6 últimos meses (contando o atual) como atalho dentro da lista
  const hoje = new Date();
  const meses = Array.from({ length: 6 }, (_, i) => {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const fim = new Date(ini.getFullYear(), ini.getMonth() + 1, 0);
    return { rotulo: `${MESES[ini.getMonth()]}/${String(ini.getFullYear()).slice(2)}`, de: isoDia(ini), ate: isoDia(fim) };
  });

  const abrir = (el: HTMLElement) => {
    setD1(de);
    setD2(ate);
    setAncora(el);
  };

  return (
    <>
      <button
        type="button"
        className={`fx-btn${ativo ? " on" : ""}`}
        onClick={(e) => (ancora ? setAncora(null) : abrir(e.currentTarget))}
      >
        <CalendarDays size={13} />
        <span className="num">
          {de && ate ? (de === ate ? dataCurta(de) : `${dataCurta(de)} – ${dataCurta(ate)}`) : rotuloVazio}
        </span>
      </button>
      {ancora && (
        <Popover ancora={ancora} largura={330} aoFechar={() => setAncora(null)}>
          <div className="pop-lista">
            <label className="campo-data">
              <span>De</span>
              <input
                type="date"
                value={d1}
                // o "de" passou do "até"? o outro acompanha, em vez de trocar os dois de lugar
                onChange={(e) => {
                  setD1(e.target.value);
                  if (d2 && e.target.value > d2) setD2(e.target.value);
                }}
              />
            </label>
            <label className="campo-data">
              <span>Até</span>
              <input
                type="date"
                value={d2}
                onChange={(e) => {
                  setD2(e.target.value);
                  if (d1 && e.target.value < d1) setD1(e.target.value);
                }}
              />
            </label>
            <div className="atalhos-mes">
              {meses.map((m) => (
                <button
                  key={m.de}
                  type="button"
                  className="mini-btn num"
                  onClick={() => {
                    setD1(m.de);
                    setD2(m.ate);
                  }}
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
          </div>
          <div className="pop-rodape">
            <span>Escolha um intervalo</span>
            <button
              type="button"
              className="btn-primary"
              style={{ height: 34 }}
              disabled={!d1 || !d2}
              onClick={() => {
                setAncora(null);
                aoAplicar(d1, d2);
              }}
            >
              Aplicar
            </button>
          </div>
        </Popover>
      )}
    </>
  );
}

/* ---------------- períodos rápidos ---------------- */
export type PeriodoRapido = "mes" | "3m" | "ano" | "12m" | "ano_ant" | "tudo";

export const PERIODOS_RAPIDOS: Array<{ v: PeriodoRapido; rotulo: string }> = [
  { v: "mes", rotulo: "Mês atual" },
  { v: "3m", rotulo: "3 meses" },
  { v: "ano", rotulo: "Ano atual" },
  { v: "12m", rotulo: "12 meses" },
  { v: "ano_ant", rotulo: "Ano anterior" },
  { v: "tudo", rotulo: "Tudo" },
];

/** Intervalo [de, até] de um período rápido; "tudo" devolve vazio (sem recorte). */
export function intervaloDoPeriodo(p: PeriodoRapido, hoje = new Date()): { de: string; ate: string } {
  const a = hoje.getFullYear(), m = hoje.getMonth();
  const fimMes = isoDia(new Date(a, m + 1, 0));
  switch (p) {
    case "mes":
      return { de: isoDia(new Date(a, m, 1)), ate: fimMes };
    case "3m":
      return { de: isoDia(new Date(a, m - 2, 1)), ate: fimMes };
    case "ano":
      return { de: `${a}-01-01`, ate: `${a}-12-31` };
    case "12m":
      return { de: isoDia(new Date(a, m - 11, 1)), ate: fimMes };
    case "ano_ant":
      return { de: `${a - 1}-01-01`, ate: `${a - 1}-12-31` };
    default:
      return { de: "", ate: "" };
  }
}
