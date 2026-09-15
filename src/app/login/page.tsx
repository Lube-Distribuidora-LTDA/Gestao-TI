"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LogIn, Loader2, ShieldCheck, LifeBuoy } from "lucide-react";
import Link from "next/link";
import { MarcaLube } from "@/components/LogoLube";

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [precisaSetup, setPrecisaSetup] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => setPrecisaSetup(!!d.precisaSetup))
      .catch(() => {});
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);

    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const d = await r.json();

      if (!r.ok) {
        setErro(d.erro ?? "Não foi possível entrar.");
        setCarregando(false);
        return;
      }

      router.push(params.get("de") || "/");
      router.refresh();
    } catch {
      setErro("Falha de conexão com o servidor.");
      setCarregando(false);
    }
  }

  return (
    <div className="w-full max-w-[420px] animate-fade-up">
      <div className="mb-8 flex justify-center">
        <MarcaLube />
      </div>

      <div className="card">
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-3xl"
          style={{ background: "#ee1c25" }}
        />

        <h1 className="text-xl font-extrabold text-white">Acesso ao painel</h1>
        <p className="mt-1 text-sm text-lube-200/60">
          Área restrita ao departamento de TI.
        </p>

        {precisaSetup && (
          <div
            className="mt-5 rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: "rgba(201,133,0,.45)", background: "rgba(201,133,0,.12)" }}
          >
            <div className="font-bold text-amber-100">Primeiro acesso</div>
            <p className="mt-1 text-amber-200/75">
              Nenhum usuário cadastrado ainda.{" "}
              <Link href="/setup" className="font-bold underline underline-offset-2">
                Criar o administrador
              </Link>
            </p>
          </div>
        )}

        <form onSubmit={entrar} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="cpd@lube.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label className="label" htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              className="input"
              placeholder="••••••••"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {erro && (
            <div
              className="rounded-xl border px-4 py-3 text-sm font-semibold text-red-100"
              style={{ borderColor: "rgba(238,28,37,.45)", background: "rgba(238,28,37,.12)" }}
            >
              {erro}
            </div>
          )}

          <button type="submit" disabled={carregando} className="btn-primary w-full">
            {carregando ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--color-border-soft)" }}>
          <Link
            href="/abrir-chamado"
            className="flex items-center justify-center gap-2 text-sm font-semibold text-lube-300 transition hover:text-white"
          >
            <LifeBuoy size={15} />
            Precisa de ajuda da TI? Abrir chamado
          </Link>
        </div>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-lube-200/35">
        <ShieldCheck size={13} />
        Conexão protegida · Lube Distribuidora
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Suspense fallback={<Loader2 className="animate-spin text-lube-300" />}>
        <Formulario />
      </Suspense>
    </div>
  );
}
