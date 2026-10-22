"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, ReceiptText, Wallet, Building2, LifeBuoy, HardDrive, KanbanSquare,
  Bot, Settings, LogOut, Menu, X, ChevronRight, ExternalLink, FilePlus2,
} from "lucide-react";
import { MarcaLube } from "./LogoLube";
import { iniciais } from "@/lib/format";

type Item = { href: string; rotulo: string; Icone: typeof LayoutDashboard; badge?: number };

export function Shell({
  children,
  usuario,
}: {
  children: React.ReactNode;
  usuario: { nome: string; email: string; papel: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);

  /*
   * Os números dos selos são buscados aqui, já com a tela desenhada. Quando
   * viviam no layout do servidor, toda navegação esperava duas consultas ao
   * banco antes de mostrar qualquer coisa — e o banco fica em outra região.
   * Aqui eles chegam atrasados alguns instantes, sem travar nada.
   */
  const [pendencias, setPendencias] = useState({ faturas: 0, chamados: 0 });

  useEffect(() => {
    let vivo = true;
    fetch("/api/pendencias")
      .then((r) => r.json())
      .then((d) => {
        if (vivo) setPendencias({ faturas: d.faturas ?? 0, chamados: d.chamados ?? 0 });
      })
      .catch(() => {
        /* contador é enfeite: sem ele o menu funciona igual */
      });
    return () => {
      vivo = false;
    };
  }, [pathname]);

  const grupos: Array<{ titulo: string; itens: Item[] }> = [
    {
      titulo: "Visão geral",
      itens: [{ href: "/", rotulo: "Dashboard", Icone: LayoutDashboard }],
    },
    {
      titulo: "Financeiro",
      itens: [
        { href: "/faturas", rotulo: "Faturas e notas", Icone: ReceiptText, badge: pendencias.faturas },
        { href: "/notas-avulsas", rotulo: "Notas avulsas", Icone: FilePlus2 },
        { href: "/contas", rotulo: "Contas e contratos", Icone: Wallet },
        { href: "/fornecedores", rotulo: "Fornecedores", Icone: Building2 },
      ],
    },
    {
      titulo: "Atendimento",
      itens: [{ href: "/chamados", rotulo: "Chamados", Icone: LifeBuoy, badge: pendencias.chamados }],
    },
    {
      titulo: "Infraestrutura",
      itens: [
        { href: "/ativos", rotulo: "Inventário", Icone: HardDrive },
        { href: "/kanban", rotulo: "Kanban TI", Icone: KanbanSquare },
      ],
    },
    {
      titulo: "Sistema",
      itens: [
        { href: "/robo", rotulo: "Robô de e-mail", Icone: Bot },
        { href: "/configuracoes", rotulo: "Configurações", Icone: Settings },
      ],
    },
  ];

  const ativo = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  async function sair() {
    setSaindo(true);
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emQuadro: window.self !== window.top }),
    });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      {/* ---------- Sidebar ---------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[272px] shrink-0 border-r transition-transform duration-300
                    lg:sticky lg:top-0 lg:h-screen lg:translate-x-0
                    ${aberto ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          borderColor: "var(--color-border-soft)",
          background: "linear-gradient(180deg, var(--bg-2), var(--bg))",
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-5 py-5">
            <Link href="/" onClick={() => setAberto(false)}>
              <MarcaLube />
            </Link>
            <button
              onClick={() => setAberto(false)}
              className="rounded-lg p-1.5 text-t3 hover:bg-white/10 lg:hidden"
              aria-label="Fechar menu"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mx-5 h-px" style={{ background: "var(--linha)" }} />

          <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
            {grupos.map((g) => (
              <div key={g.titulo}>
                <div className="mb-2 px-3 text-[10.5px] font-bold uppercase tracking-[0.17em] text-[var(--t3)]">
                  {g.titulo}
                </div>
                <div className="space-y-1">
                  {g.itens.map(({ href, rotulo, Icone, badge }) => {
                    const on = ativo(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        prefetch
                        onClick={() => setAberto(false)}
                        className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold
                                    transition-colors duration-200
                          ${
                            on
                              ? "text-[var(--ouro-forte)]"
                              : "text-[var(--t2)] hover:bg-[var(--luz)] hover:text-[var(--t1)]"
                          }`}
                        style={
                          on ? { background: "linear-gradient(90deg, var(--ouro-dim), transparent)" } : undefined
                        }
                      >
                        {/* item ativo em ouro, como nos sistemas recentes (Fiscal, Inventário) */}
                        {on && (
                          <span
                            className="absolute -left-3 top-[9px] bottom-[9px] w-1 rounded-r"
                            style={{ background: "var(--ouro)", boxShadow: "0 0 14px var(--ouro)" }}
                          />
                        )}
                        <Icone size={18} strokeWidth={1.8} />
                        <span className="flex-1">{rotulo}</span>
                        {!!badge && badge > 0 && (
                          <span
                            className="num rounded-full px-2 py-0.5 text-[10.5px] font-extrabold text-t1"
                            style={{ background: "var(--verm)" }}
                          >
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* atalho para o portal público */}
            <div className="px-1 pt-2">
              <Link
                href="/abrir-chamado"
                target="_blank"
                className="flex items-center gap-2.5 rounded-xl border border-dashed px-3 py-3 text-xs font-semibold
                           text-[var(--t2)] transition hover:border-[var(--ouro-linha)] hover:text-[var(--ouro-forte)]"
                style={{ borderColor: "var(--linha-2)" }}
              >
                <ExternalLink size={15} />
                <span className="flex-1">Portal de chamados</span>
                <ChevronRight size={14} />
              </Link>
            </div>
          </nav>

          {/* usuário */}
          <div className="border-t p-4" style={{ borderColor: "var(--color-border-soft)" }}>
            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--s1)" }}>
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-t1"
                style={{ background: "linear-gradient(135deg, var(--azul), #16225f)" }}
              >
                {iniciais(usuario.nome)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-[var(--t1)]">{usuario.nome}</div>
                <div className="truncate text-[11px] capitalize text-[var(--t3)]">{usuario.papel}</div>
              </div>
              <button
                onClick={sair}
                disabled={saindo}
                title="Sair"
                className="rounded-lg p-2 text-[var(--t3)] transition hover:bg-[var(--perigo-bg)] hover:text-[var(--verm-lt)] disabled:opacity-50"
              >
                <LogOut size={16} />
              </button>
            </div>
            <div className="mt-3 flex items-center px-1 text-[11.5px] text-[var(--t3)]">
              <span
                className="mr-2 inline-block h-[7px] w-[7px] rounded-full"
                style={{ background: "var(--ok)", boxShadow: "0 0 10px var(--ok)" }}
              />
              versão <span className="num ml-1 text-[var(--t2)]">{process.env.NEXT_PUBLIC_VERSAO}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* fundo escuro do menu no mobile */}
      {aberto && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setAberto(false)}
        />
      )}

      {/* ---------- Conteúdo ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3 lg:hidden"
          style={{
            borderColor: "var(--color-border-soft)",
            background: "rgba(5,11,28,.92)",
            backdropFilter: "blur(12px)",
          }}
        >
          <button
            onClick={() => setAberto(true)}
            className="rounded-lg p-2 text-t2 hover:bg-white/10"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <MarcaLube compacto />
          <span className="font-display text-sm font-bold text-[var(--t1)]">Gestão de TI</span>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
