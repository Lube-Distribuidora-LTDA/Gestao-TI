"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive, Plus, Search, Pencil, Trash2, Loader2 } from "lucide-react";
import { PageHeader, Modal, Vazio, Aviso, useAviso, BotaoAcao, Badge, KpiCard } from "@/components/UI";
import { moeda, data } from "@/lib/format";
import { STATUS_ATIVO, TIPOS_ATIVO, SETORES, type StatusAtivo } from "@/lib/tipos";

type Ativo = {
  id: string;
  patrimonio: string | null;
  tipo: string;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  usuario_atual: string | null;
  setor: string | null;
  localizacao: string | null;
  status: StatusAtivo;
  data_aquisicao: string | null;
  valor_aquisicao: number | null;
  garantia_ate: string | null;
  especificacoes: string | null;
  observacoes: string | null;
};

const VAZIO = {
  patrimonio: "", tipo: "Computador", marca: "", modelo: "", numero_serie: "",
  usuario_atual: "", setor: "", localizacao: "", status: "em_uso" as StatusAtivo,
  data_aquisicao: "", valor_aquisicao: "", garantia_ate: "", especificacoes: "", observacoes: "",
};

export default function AtivosPage() {
  const { aviso, mostrar, limpar } = useAviso();
  const [lista, setLista] = useState<Ativo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ ...VAZIO });

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await fetch(`/api/crud/ativos?busca=${encodeURIComponent(busca)}`);
    const d = await r.json();
    if (r.ok) setLista(d.dados ?? []);
    setCarregando(false);
  }, [busca]);

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  function abrirNovo() {
    setForm({ ...VAZIO });
    setEditando(null);
    setModal(true);
  }

  function abrirEdicao(a: Ativo) {
    setForm({
      patrimonio: a.patrimonio ?? "",
      tipo: a.tipo,
      marca: a.marca ?? "",
      modelo: a.modelo ?? "",
      numero_serie: a.numero_serie ?? "",
      usuario_atual: a.usuario_atual ?? "",
      setor: a.setor ?? "",
      localizacao: a.localizacao ?? "",
      status: a.status,
      data_aquisicao: a.data_aquisicao ?? "",
      valor_aquisicao: a.valor_aquisicao != null ? String(a.valor_aquisicao) : "",
      garantia_ate: a.garantia_ate ?? "",
      especificacoes: a.especificacoes ?? "",
      observacoes: a.observacoes ?? "",
    });
    setEditando(a.id);
    setModal(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);

    const corpo = {
      ...form,
      patrimonio: form.patrimonio || null,
      valor_aquisicao: form.valor_aquisicao ? Number(form.valor_aquisicao) : null,
      data_aquisicao: form.data_aquisicao || null,
      garantia_ate: form.garantia_ate || null,
    };

    const r = await fetch(editando ? `/api/crud/ativos/${editando}` : "/api/crud/ativos", {
      method: editando ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const d = await r.json();
    setSalvando(false);

    if (r.ok) {
      mostrar("sucesso", editando ? "Equipamento atualizado." : "Equipamento cadastrado.");
      setModal(false);
      carregar();
    } else {
      mostrar("erro", d.erro ?? "Não foi possível salvar.");
    }
  }

  async function excluir(a: Ativo) {
    if (!confirm(`Excluir o equipamento ${a.patrimonio || a.modelo || "selecionado"}?`)) return;
    const r = await fetch(`/api/crud/ativos/${a.id}`, { method: "DELETE" });
    if (r.ok) {
      mostrar("sucesso", "Equipamento excluído.");
      carregar();
    } else {
      mostrar("erro", "Não foi possível excluir.");
    }
  }

  const emUso = lista.filter((a) => a.status === "em_uso").length;
  const estoque = lista.filter((a) => a.status === "estoque").length;
  const patrimonio = lista.reduce((s, a) => s + Number(a.valor_aquisicao ?? 0), 0);

  return (
    <>
      <PageHeader
        icone={<HardDrive size={21} />}
        titulo="Inventário de TI"
        descricao="Equipamentos da empresa: quem usa, onde está e quanto custou."
        acoes={
          <button onClick={abrirNovo} className="btn-primary">
            <Plus size={16} />
            Novo equipamento
          </button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard rotulo="Total cadastrado" valor={String(lista.length)} icone={<HardDrive size={20} />} cor="#3987e5" />
        <KpiCard rotulo="Em uso" valor={String(emUso)} icone={<HardDrive size={20} />} cor="#199e70" atraso={60} />
        <KpiCard rotulo="Em estoque" valor={String(estoque)} icone={<HardDrive size={20} />} cor="#c98500" atraso={120} />
        <KpiCard rotulo="Patrimônio" valor={moeda(patrimonio)} icone={<HardDrive size={20} />} cor="#9085e9" atraso={180} />
      </div>

      <div className="card mb-5 animate-fade-up">
        <div className="relative max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-lube-300/50" />
          <input
            className="input pl-9"
            placeholder="Patrimônio, modelo, série, usuário ou setor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center gap-3 py-16 text-sm text-lube-200/55">
          <Loader2 size={18} className="animate-spin" /> Carregando...
        </div>
      ) : lista.length === 0 ? (
        <div className="card">
          <Vazio
            titulo="Nenhum equipamento cadastrado"
            descricao="Comece pelo que está em uso: computadores, notebooks, impressoras e servidores."
            Icone={HardDrive}
            acao={
              <button onClick={abrirNovo} className="btn-primary">
                <Plus size={16} /> Cadastrar o primeiro
              </button>
            }
          />
        </div>
      ) : (
        <div className="table-wrap animate-fade-up">
          <table className="tbl">
            <thead>
              <tr>
                <th>Patrimônio</th>
                <th>Equipamento</th>
                <th>Usuário / Setor</th>
                <th>Localização</th>
                <th className="text-center">Situação</th>
                <th className="text-right">Valor</th>
                <th className="text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => {
                const st = STATUS_ATIVO[a.status];
                return (
                  <tr key={a.id}>
                    <td className="font-bold text-white">{a.patrimonio || "—"}</td>
                    <td>
                      <div className="text-lube-50">
                        {[a.marca, a.modelo].filter(Boolean).join(" ") || a.tipo}
                      </div>
                      <div className="text-xs text-lube-200/50">
                        {a.tipo}
                        {a.numero_serie ? ` · SN ${a.numero_serie}` : ""}
                      </div>
                    </td>
                    <td>
                      <div className="text-lube-50">{a.usuario_atual || "—"}</div>
                      <div className="text-xs text-lube-200/50">{a.setor || ""}</div>
                    </td>
                    <td className="text-lube-100">{a.localizacao || "—"}</td>
                    <td>
                      <div className="flex justify-center">
                        <Badge classe={st.classe} ponto={st.ponto}>{st.label}</Badge>
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-right text-lube-100">
                      {a.valor_aquisicao ? moeda(Number(a.valor_aquisicao)) : "—"}
                      {a.garantia_ate && (
                        <div className="text-[11px] text-lube-200/45">
                          garantia {data(a.garantia_ate)}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => abrirEdicao(a)}
                          className="rounded-lg p-1.5 text-lube-300 transition hover:bg-white/10 hover:text-white"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => excluir(a)}
                          className="rounded-lg p-1.5 text-lube-300/60 transition hover:bg-[#ee1c25]/20 hover:text-red-300"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        aberto={modal}
        aoFechar={() => setModal(false)}
        titulo={editando ? "Editar equipamento" : "Novo equipamento"}
        largura="max-w-3xl"
      >
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Patrimônio</label>
              <input
                className="input"
                placeholder="ex.: PC-0042"
                value={form.patrimonio}
                onChange={(e) => setForm({ ...form, patrimonio: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Tipo *</label>
              <select
                className="input"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              >
                {TIPOS_ATIVO.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Situação</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as StatusAtivo })}
              >
                {Object.entries(STATUS_ATIVO).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Marca</label>
              <input
                className="input"
                value={form.marca}
                onChange={(e) => setForm({ ...form, marca: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Modelo</label>
              <input
                className="input"
                value={form.modelo}
                onChange={(e) => setForm({ ...form, modelo: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Número de série</label>
              <input
                className="input"
                value={form.numero_serie}
                onChange={(e) => setForm({ ...form, numero_serie: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Usuário atual</label>
              <input
                className="input"
                value={form.usuario_atual}
                onChange={(e) => setForm({ ...form, usuario_atual: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Setor</label>
              <select
                className="input"
                value={form.setor}
                onChange={(e) => setForm({ ...form, setor: e.target.value })}
              >
                <option value="">—</option>
                {SETORES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Localização</label>
              <input
                className="input"
                placeholder="ex.: Matriz — 2º andar"
                value={form.localizacao}
                onChange={(e) => setForm({ ...form, localizacao: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Data de aquisição</label>
              <input
                type="date"
                className="input"
                value={form.data_aquisicao}
                onChange={(e) => setForm({ ...form, data_aquisicao: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={form.valor_aquisicao}
                onChange={(e) => setForm({ ...form, valor_aquisicao: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Garantia até</label>
              <input
                type="date"
                className="input"
                value={form.garantia_ate}
                onChange={(e) => setForm({ ...form, garantia_ate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Especificações</label>
            <textarea
              className="input min-h-[62px]"
              placeholder="ex.: i5 10ª geração, 16 GB RAM, SSD 512 GB"
              value={form.especificacoes}
              onChange={(e) => setForm({ ...form, especificacoes: e.target.value })}
            />
          </div>

          <div
            className="flex justify-end gap-2 border-t pt-4"
            style={{ borderColor: "var(--color-border-soft)" }}
          >
            <button type="button" onClick={() => setModal(false)} className="btn-ghost">
              Cancelar
            </button>
            <BotaoAcao type="submit" carregando={salvando} className="btn-primary">
              {editando ? "Salvar alterações" : "Cadastrar"}
            </BotaoAcao>
          </div>
        </form>
      </Modal>

      {aviso && <Aviso tipo={aviso.tipo} mensagem={aviso.mensagem} aoFechar={limpar} />}
    </>
  );
}
