"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Loader2, LifeBuoy } from "lucide-react";
import { MarcaLube } from "@/components/LogoLube";

export default function BuscarChamadoPage() {
  const router = useRouter();
  const [protocolo, setProtocolo] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setBuscando(true);
    setErro(null);

    const r = await fetch("/api/chamados/publico/buscar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ protocolo, email }),
    });
    const d = await r.json();

    if (r.ok) router.push(`/acompanhar/${d.token}`);
    else {
      setErro(d.erro ?? "Não foi possível localizar o chamado.");
      setBuscando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[440px] animate-fade-up">
        <div className="mb-8 flex justify-center">
          <MarcaLube />
        </div>

        <div className="card">
          <h1 className="text-xl font-extrabold text-white">Acompanhar chamado</h1>
          <p className="mt-1 text-sm text-lube-200/60">
            Informe o protocolo e o e-mail usado na abertura.
          </p>

          <form onSubmit={buscar} className="mt-6 space-y-4">
            <div>
              <label className="label">Protocolo</label>
              <input
                className="input uppercase"
                required
                placeholder="TI-2026-00001"
                value={protocolo}
                onChange={(e) => setProtocolo(e.target.value)}
              />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input
                type="email"
                className="input"
                required
                placeholder="seunome@lube.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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

            <button type="submit" disabled={buscando} className="btn-primary w-full">
              {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Buscar meu chamado
            </button>
          </form>

          <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--color-border-soft)" }}>
            <Link
              href="/abrir-chamado"
              className="flex items-center justify-center gap-2 text-sm font-semibold text-lube-300 transition hover:text-white"
            >
              <LifeBuoy size={15} />
              Abrir um novo chamado
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
