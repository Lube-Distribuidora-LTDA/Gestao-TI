"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, CheckCircle2 } from "lucide-react";
import { MarcaLube } from "@/components/LogoLube";

export default function SetupPage() {
  const router = useRouter();
  const [liberado, setLiberado] = useState<boolean | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", senha: "", confirma: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => setLiberado(!!d.precisaSetup))
      .catch(() => setLiberado(false));
  }, []);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (form.senha !== form.confirma) {
      setErro("As senhas não conferem.");
      return;
    }
    if (form.senha.length < 8) {
      setErro("A senha precisa ter no mínimo 8 caracteres.");
      return;
    }

    setCarregando(true);
    const r = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: form.nome, email: form.email, senha: form.senha }),
    });
    const d = await r.json();

    if (!r.ok) {
      setErro(d.erro ?? "Não foi possível criar o administrador.");
      setCarregando(false);
      return;
    }

    setPronto(true);
    setTimeout(() => router.push("/login"), 2200);
  }

  if (liberado === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-lube-300" size={30} />
      </div>
    );
  }

  if (!liberado) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card w-full max-w-md text-center">
          <h1 className="text-lg font-extrabold text-white">Sistema já configurado</h1>
          <p className="mt-2 text-sm text-lube-200/60">
            Já existe pelo menos um usuário cadastrado. Peça a um administrador para criar seu acesso.
          </p>
          <a href="/login" className="btn-primary mt-5 inline-flex">Ir para o login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[460px] animate-fade-up">
        <div className="mb-8 flex justify-center">
          <MarcaLube />
        </div>

        <div className="card">
          {pronto ? (
            <div className="py-6 text-center">
              <CheckCircle2 size={44} className="mx-auto text-emerald-400" />
              <h1 className="mt-4 text-lg font-extrabold text-white">Administrador criado</h1>
              <p className="mt-2 text-sm text-lube-200/60">Redirecionando para o login...</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-extrabold text-white">Primeiro acesso</h1>
              <p className="mt-1 text-sm text-lube-200/60">
                Crie o usuário administrador do sistema. Esta tela fecha sozinha depois disso.
              </p>

              <form onSubmit={criar} className="mt-6 space-y-4">
                <div>
                  <label className="label">Nome</label>
                  <input
                    className="input"
                    placeholder="Júlio Alves"
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label">E-mail</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="cpd@lube.com.br"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label">Senha</label>
                    <input
                      type="password"
                      className="input"
                      placeholder="mínimo 8 caracteres"
                      value={form.senha}
                      onChange={(e) => setForm({ ...form, senha: e.target.value })}
                      required
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label className="label">Repetir senha</label>
                    <input
                      type="password"
                      className="input"
                      value={form.confirma}
                      onChange={(e) => setForm({ ...form, confirma: e.target.value })}
                      required
                      autoComplete="new-password"
                    />
                  </div>
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
                  {carregando ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                  Criar administrador
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
