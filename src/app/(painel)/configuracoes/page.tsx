"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings, Save, Loader2, Palette, Plus, Pencil, Trash2, Info } from "lucide-react";
import { PageHeader, Modal, Aviso, useAviso, BotaoAcao } from "@/components/UI";

type Config = { chave: string; valor: string | null; descricao: string | null };
type Categoria = {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string;
  ordem: number;
  ativo: boolean;
};

/** Paleta validada para o fundo escuro do painel — mesma ordem dos gráficos. */
const CORES = [
  "#3987e5", "#d95926", "#199e70", "#c98500",
  "#d55181", "#008300", "#9085e9", "#e66767",
];

const CHAVES_TEXTO = ["empresa_nome", "ti_email_remetente", "ti_responsavel", "imap_pasta"];
const CHAVES_BOOL = [
  "cobranca_ativa_global",
  "leitura_email_ativa",
  "notificar_chamado_email",
];

export default function ConfiguracoesPage() {
  const { aviso, mostrar, limpar } = useAviso();
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [descricoes, setDescricoes] = useState<Record<string, string>>({});
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [modalCat, setModalCat] = useState(false);
  const [editandoCat, setEditandoCat] = useState<string | null>(null);
  const [formCat, setFormCat] = useState({ nome: "", descricao: "", cor: CORES[0], ordem: "0", ativo: true });

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [c, cat] = await Promise.all([
      fetch("/api/configuracoes").then((r) => r.json()),
      fetch("/api/crud/categorias_custo").then((r) => r.json()),
    ]);

    const mapa: Record<string, string> = {};
    const desc: Record<string, string> = {};
    for (const row of (c.dados ?? []) as Config[]) {
      mapa[row.chave] = row.valor ?? "";
      desc[row.chave] = row.descricao ?? "";
    }
    setConfigs(mapa);
    setDescricoes(desc);
    setCategorias(cat.dados ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvarConfigs() {
    setSalvando(true);
    const r = await fetch("/api/configuracoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(configs),
    });
    const d = await r.json();
    setSalvando(false);

    if (r.ok) mostrar("sucesso", "Configurações salvas.");
    else mostrar("erro", d.erro ?? "Não foi possível salvar.");
  }

  async function salvarCategoria(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);

    const corpo = { ...formCat, ordem: Number(formCat.ordem || 0) };
    const r = await fetch(
      editandoCat ? `/api/crud/categorias_custo/${editandoCat}` : "/api/crud/categorias_custo",
      {
        method: editandoCat ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }
    );
    const d = await r.json();
    setSalvando(false);

    if (r.ok) {
      mostrar("sucesso", editandoCat ? "Categoria atualizada." : "Categoria criada.");
      setModalCat(false);
      carregar();
    } else {
      mostrar("erro", d.erro ?? "Não foi possível salvar.");
    }
  }

  async function excluirCategoria(c: Categoria) {
    if (!confirm(`Excluir a categoria "${c.nome}"?`)) return;
    const r = await fetch(`/api/crud/categorias_custo/${c.id}`, { method: "DELETE" });
    const d = await r.json();
    if (r.ok) {
      mostrar("sucesso", "Categoria excluída.");
      carregar();
    } else {
      mostrar("erro", d.erro ?? "Não foi possível excluir.");
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-sm text-lube-200/55">
        <Loader2 size={20} className="animate-spin" /> Carregando configurações...
      </div>
    );
  }

  return (
    <>
      <PageHeader
        icone={<Settings size={21} />}
        titulo="Configurações"
        descricao="Preferências do sistema, automações e categorias de custo."
        acoes={
          <BotaoAcao carregando={salvando} onClick={salvarConfigs} className="btn-primary">
            <Save size={15} />
            Salvar
          </BotaoAcao>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------- gerais ---------- */}
        <div className="card animate-fade-up">
          <h2 className="mb-4 text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
            Identificação
          </h2>
          <div className="space-y-4">
            {CHAVES_TEXTO.map((k) => (
              <div key={k}>
                <label className="label">{rotulo(k)}</label>
                <input
                  className="input"
                  value={configs[k] ?? ""}
                  onChange={(e) => setConfigs({ ...configs, [k]: e.target.value })}
                />
                {descricoes[k] && (
                  <p className="mt-1 text-[11px] text-lube-200/45">{descricoes[k]}</p>
                )}
              </div>
            ))}

            <div>
              <label className="label">Dias retroativos na leitura do webmail</label>
              <input
                type="number"
                min={1}
                max={60}
                className="input"
                value={configs["imap_dias_retroativos"] ?? "7"}
                onChange={(e) => setConfigs({ ...configs, imap_dias_retroativos: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-lube-200/45">
                Quantos dias para trás o robô varre a cada execução.
              </p>
            </div>
          </div>
        </div>

        {/* ---------- automações ---------- */}
        <div className="card animate-fade-up" style={{ animationDelay: "80ms" }}>
          <h2 className="mb-4 text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
            Automações
          </h2>

          <div className="space-y-3">
            {CHAVES_BOOL.map((k) => (
              <label
                key={k}
                className="flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition hover:border-lube-400/40"
                style={{ borderColor: "var(--color-border-soft)" }}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[#4659e0]"
                  checked={configs[k] !== "false"}
                  onChange={(e) => setConfigs({ ...configs, [k]: e.target.checked ? "true" : "false" })}
                />
                <div>
                  <div className="text-sm font-bold text-white">{rotulo(k)}</div>
                  {descricoes[k] && (
                    <p className="mt-0.5 text-xs text-lube-200/55">{descricoes[k]}</p>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div
            className="mt-4 flex items-start gap-2.5 rounded-xl border px-4 py-3"
            style={{ borderColor: "rgba(57,135,229,.35)", background: "rgba(57,135,229,.08)" }}
          >
            <Info size={15} className="mt-0.5 shrink-0 text-sky-300" />
            <p className="text-xs leading-relaxed text-sky-100/85">
              As chaves de conexão (senha do e-mail, banco e segredo do agendador) ficam nas
              variáveis de ambiente, não aqui — assim nenhuma senha trafega pelo navegador nem
              fica gravada no banco.
            </p>
          </div>
        </div>

        {/* ---------- categorias ---------- */}
        <div className="card animate-fade-up lg:col-span-2" style={{ animationDelay: "140ms" }}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
                Categorias de custo
              </h2>
              <p className="mt-0.5 text-xs text-lube-200/50">
                Definem as cores e os agrupamentos do dashboard.
              </p>
            </div>
            <button
              onClick={() => {
                setFormCat({ nome: "", descricao: "", cor: CORES[0], ordem: String(categorias.length + 1), ativo: true });
                setEditandoCat(null);
                setModalCat(true);
              }}
              className="btn-ghost"
            >
              <Plus size={15} />
              Nova categoria
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {categorias.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-xl border px-3.5 py-3"
                style={{ borderColor: "var(--color-border-soft)", background: "rgba(255,255,255,.025)" }}
              >
                <span
                  className="h-9 w-1.5 shrink-0 rounded-full"
                  style={{ background: c.cor }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">{c.nome}</div>
                  {c.descricao && (
                    <div className="truncate text-[11px] text-lube-200/50">{c.descricao}</div>
                  )}
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <button
                    onClick={() => {
                      setFormCat({
                        nome: c.nome,
                        descricao: c.descricao ?? "",
                        cor: c.cor,
                        ordem: String(c.ordem),
                        ativo: c.ativo,
                      });
                      setEditandoCat(c.id);
                      setModalCat(true);
                    }}
                    className="rounded-lg p-1.5 text-lube-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => excluirCategoria(c)}
                    className="rounded-lg p-1.5 text-lube-300/60 transition hover:bg-[#ee1c25]/20 hover:text-red-300"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        aberto={modalCat}
        aoFechar={() => setModalCat(false)}
        titulo={editandoCat ? "Editar categoria" : "Nova categoria"}
        largura="max-w-lg"
      >
        <form onSubmit={salvarCategoria} className="space-y-4">
          <div>
            <label className="label">Nome *</label>
            <input
              className="input"
              required
              value={formCat.nome}
              onChange={(e) => setFormCat({ ...formCat, nome: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input
              className="input"
              value={formCat.descricao}
              onChange={(e) => setFormCat({ ...formCat, descricao: e.target.value })}
            />
          </div>

          <div>
            <label className="label">
              <Palette size={12} className="mr-1 inline" />
              Cor no dashboard
            </label>
            <div className="flex flex-wrap gap-2">
              {CORES.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  onClick={() => setFormCat({ ...formCat, cor })}
                  className="h-9 w-9 rounded-lg transition hover:scale-110"
                  style={{
                    background: cor,
                    outline: formCat.cor === cor ? "2.5px solid white" : "2px solid #0e1742",
                    outlineOffset: formCat.cor === cor ? "2px" : "0",
                  }}
                  title={cor}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-lube-200/45">
              Paleta testada para leitura no tema escuro, inclusive por quem tem daltonismo.
            </p>
          </div>

          <div>
            <label className="label">Ordem de exibição</label>
            <input
              type="number"
              className="input"
              value={formCat.ordem}
              onChange={(e) => setFormCat({ ...formCat, ordem: e.target.value })}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-lube-100">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#4659e0]"
              checked={formCat.ativo}
              onChange={(e) => setFormCat({ ...formCat, ativo: e.target.checked })}
            />
            Categoria ativa
          </label>

          <div
            className="flex justify-end gap-2 border-t pt-4"
            style={{ borderColor: "var(--color-border-soft)" }}
          >
            <button type="button" onClick={() => setModalCat(false)} className="btn-ghost">
              Cancelar
            </button>
            <BotaoAcao type="submit" carregando={salvando} className="btn-primary">
              Salvar
            </BotaoAcao>
          </div>
        </form>
      </Modal>

      {aviso && <Aviso tipo={aviso.tipo} mensagem={aviso.mensagem} aoFechar={limpar} />}
    </>
  );
}

function rotulo(chave: string): string {
  const mapa: Record<string, string> = {
    empresa_nome: "Nome da empresa",
    ti_email_remetente: "E-mail do departamento de TI",
    ti_responsavel: "Assinatura dos e-mails",
    imap_pasta: "Pasta do webmail",
    cobranca_ativa_global: "Cobrança automática de fornecedores",
    leitura_email_ativa: "Leitura automática do webmail",
    notificar_chamado_email: "Avisar solicitante por e-mail",
  };
  return mapa[chave] ?? chave;
}
