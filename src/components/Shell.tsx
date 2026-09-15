"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, ReceiptText, Wallet, Building2, LifeBuoy, HardDrive,
  Bot, Settings, LogOut, Menu, X, ChevronRight, ExternalLink,
} from "lucide-react";
import { MarcaLube } from "./LogoLube";
import { iniciais } from "@/lib/format";

type Item = { href: string; rotulo: string; Icone: typeof LayoutDashboard; badge?: number };

export function Shell({
  children,
  usuario,
  pendencias,
}: {
  children: React.ReactNode;
  usuario: { nome: string; email: string; papel: string };
  pendencias: { faturas: number; chamados: number };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);

  const grupos: Array<{ titulo: string; itens: Item[] }> = [
    {
      titulo: "Visão geral",
      itens: [{ href: "/", rotulo: "Dashboard", Icone: LayoutDashboard }],
    },
    {
      titulo: "Financeiro",
      itens: [
        { href: "/faturas", rotulo: "Faturas e notas", Icone: ReceiptText, badge: pendencias.faturas },
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
      itens: [{ href: "/ativos", rotulo: "Inventário", Icone: HardDrive }],
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
    await fetch("/api/auth/logout", { method: "POST" });
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
          background: "linear-gradient(185deg, rgba(14,23,66,.97), rgba(6,11,34,.99))",
          backdropFilter: "blur(14px)",
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-5 py-5">
            <Link href="/" onClick={() => setAberto(false)}>
              <MarcaLube />
            </Link>
            <button
              onClick={() => setAberto(false)}
              className="rounded-lg p-1.5 text-lube-300 hover:bg-white/10 lg:hidden"
              aria-label="Fechar menu"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mx-5 h-px bg-gradient-to-r from-transparent via-lube-500/40 to-transparent" />

          <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
            {grupos.map((g) => (
              <div key={g.titulo}>
                <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-lube-300/55">
                  {g.titulo}
                </div>
                <div className="space-y-1">
                  {g.itens.map(({ href, rotulo, Icone, badge }) => {
                    const on = ativo(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setAberto(false)}
                        className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold
                                    transition-all duration-200
                          ${
                            on
                              ? "text-white"
                              : "text-lube-200/75 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        style={
                          on
                            ? {
                                background:
                                  "linear-gradient(100deg, rgba(47,60,196,.55), rgba(47,60,196,.12))",
                                boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
                              }
                            : undefined
                        }
                      >
                        {on && (
                          <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[#ee1c25]" />
                        )}
                        <Icone size={17} className={on ? "text-lube-100" : "text-lube-300/70"} />
                        <span className="flex-1">{rotulo}</span>
                        {!!badge && badge > 0 && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                              on ? "bg-white/20 text-white" : "bg-[#ee1c25]/85 text-white"
                            }`}
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
                           text-lube-200/80 transition hover:border-lube-400/60 hover:text-white"
                style={{ borderColor: "rgba(126,148,255,.25)" }}
              >
                <ExternalLink size={15} />
                <span className="flex-1">Portal de chamados</span>
                <ChevronRight size={14} />
              </Link>
            </div>
          </nav>

          {/* usuário */}
          <div className="border-t p-4" style={{ borderColor: "var(--color-border-soft)" }}>
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white"
                style={{ background: "linear-gradient(135deg,#2f3cc4,#16225f)" }}
              >
                {iniciais(usuario.nome)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white">{usuario.nome}</div>
                <div className="truncate text-[11px] capitalize text-lube-300/70">{usuario.papel}</div>
              </div>
              <button
                onClick={sair}
                disabled={saindo}
                title="Sair"
                className="rounded-lg p-2 text-lube-300/70 transition hover:bg-[#ee1c25]/20 hover:text-red-300 disabled:opacity-50"
              >
                <LogOut size={16} />
              </button>
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
            background: "rgba(6,11,34,.92)",
            backdropFilter: "blur(12px)",
          }}
        >
          <button
            onClick={() => setAberto(true)}
            className="rounded-lg p-2 text-lube-200 hover:bg-white/10"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <MarcaLube compacto />
          <span className="text-sm font-bold text-white">Gestão de TI</span>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
