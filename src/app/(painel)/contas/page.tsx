"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Wallet, Plus, Search, Pencil, Trash2, Loader2, Bot, BellOff, FileSpreadsheet,
} from "lucide-react";
import { PageHeader, Modal, Vazio, Aviso, useAviso, BotaoAcao, Badge } from "@/components/UI";
import { moeda } from "@/lib/format";
import { PERIODICIDADE, type Periodicidade } from "@/lib/tipos";

type Conta = {
  id: string;
  fornecedor_id: string;
  categoria_id: string | null;
  descricao: string;
  identificador: string | null;
  valor_previsto: number;
  periodicidade: Periodicidade;
  dia_vencimento: number | null;
  exige_nota_fiscal: boolean;
  exige_fatura: boolean;
  cobranca_ativa: boolean;
  dias_antes_vencimento: number;
  intervalo_cobranca_dias: number;
  max_cobrancas: number;
  palavras_chave: string[];
  centro_custo: string | null;
  ativo: boolean;
  observacoes: string | null;
};

type Opcao = { id: string; nome: string; cor?: string };

const VAZIO = {
  fornecedor_id: "", categoria_id: "", descricao: "", identificador: "",
  valor_previsto: "", periodicidade: "mensal" as Periodicidade, dia_vencimento: "10",
  exige_nota_fiscal: true, exige_fatura: true, cobranca_ativa: true,
  dias_antes_vencimento: "5", intervalo_cobranca_dias: "3", max_cobrancas: "4",
  palavras_chave: "", centro_custo: "", ativo: true, observacoes: "",
};

export default function ContasPage() {
  const { aviso, mostrar, limpar } = useAviso();
  const [lista, setLista] = useState<Conta[]>([]);
  const [fornecedores, setFornecedores] = useState<Opcao[]>([]);
  const [categorias, setCategorias] = useState<Opcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [fCategoria, setFCategoria] = useState("");
  const [fFornecedor, setFFornecedor] = useState("");
  const [fSituacao, setFSituacao] = useState("ativas");
  const [exportando, setExportando] = useState(false);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ ...VAZIO });

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [c, f, cat] = await Promise.all([
      fetch(`/api/crud/contas?busca=${encodeURIComponent(busca)}`).then((r) => r.json()),
      fetch("/api/crud/fornecedores?ativo=true").then((r) => r.json()),
      fetch("/api/crud/categorias_custo?ativo=true").then((r) => r.json()),
    ]);
    setLista(c.dados ?? []);
    setFornecedores(f.dados ?? []);
    setCategorias(cat.dados ?? []);
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

  function abrirEdicao(c: Conta) {
    setForm({
      fornecedor_id: c.fornecedor_id,
      categoria_id: c.categoria_id ?? "",
      descricao: c.descricao,
      identificador: c.identificador ?? "",
      valor_previsto: String(c.valor_previsto ?? ""),
      periodicidade: c.periodicidade,
      dia_vencimento: String(c.dia_vencimento ?? ""),
      exige_nota_fiscal: c.exige_nota_fiscal,
      exige_fatura: c.exige_fatura,
      cobranca_ativa: c.cobranca_ativa,
      dias_antes_vencimento: String(c.dias_antes_vencimento),
      intervalo_cobranca_dias: String(c.intervalo_cobranca_dias),
      max_cobrancas: String(c.max_cobrancas),
      palavras_chave: (c.palavras_chave ?? []).join(", "),
      centro_custo: c.centro_custo ?? "",
      ativo: c.ativo,
      observacoes: c.observacoes ?? "",
    });
    setEditando(c.id);
    setModal(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);

    const corpo = {
      ...form,
      categoria_id: form.categoria_id || null,
      valor_previsto: Number(form.valor_previsto || 0),
      dia_vencimento: form.dia_vencimento ? Number(form.dia_vencimento) : null,
      dias_antes_vencimento: Number(form.dias_antes_vencimento || 5),
      intervalo_cobranca_dias: Number(form.intervalo_cobranca_dias || 3),
      max_cobrancas: Number(form.max_cobrancas || 4),
      palavras_chave: form.palavras_chave.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
    };

    const r = await fetch(editando ? `/api/crud/contas/${editando}` : "/api/crud/contas", {
      method: editando ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const d = await r.json();
    setSalvando(false);

    if (r.ok) {
      mostrar("sucesso", editando ? "Conta atualizada." : "Conta cadastrada.");
      setModal(false);
      carregar();
    } else {
      mostrar("erro", d.erro ?? "Não foi possível salvar.");
    }
  }

  async function excluir(c: Conta) {
    if (!confirm(`Excluir a conta "${c.descricao}"?\n\nAs faturas já geradas também serão removidas.`)) return;
    const r = await fetch(`/api/crud/contas/${c.id}`, { method: "DELETE" });
    const d = await r.json();
    if (r.ok) {
      mostrar("sucesso", "Conta excluída.");
      carregar();
    } else {
      mostrar("erro", d.erro ?? "Não foi possível excluir.");
    }
  }

  const nomeFornecedor = (id: string) => fornecedores.find((f) => f.id === id)?.nome ?? "—";
  const categoria = (id: string | null) => categorias.find((c) => c.id === id);

  /*
   * Os filtros são aplicados aqui, e não no servidor: a lista de contratos é
   * curta e cabe inteira na tela, então filtrar em memória responde na hora.
   * A busca continua no servidor porque ela também olha campos que a tela não
   * mostra.
   */
  const contas = lista.filter((c) => {
    if (fCategoria === "sem" ? c.categoria_id !== null : fCategoria && c.categoria_id !== fCategoria)
      return false;
    if (fFornecedor && c.fornecedor_id !== fFornecedor) return false;
    if (fSituacao === "ativas" && !c.ativo) return false;
    if (fSituacao === "inativas" && c.ativo) return false;
    return true;
  });

  const totalMensal = contas
    .filter((c) => c.ativo && c.periodicidade === "mensal")
    .reduce((s, c) => s + Number(c.valor_previsto ?? 0), 0);

  const filtrando = !!(busca || fCategoria || fFornecedor || fSituacao !== "ativas");

  /*
   * A planilha sai do servidor já montada, com os mesmos filtros da tela: sem
   * isso, exportar daria um arquivo diferente do que está sendo olhado.
   */
  async function exportar() {
    setExportando(true);
    try {
      const qs = new URLSearchParams();
      if (busca) qs.set("busca", busca);
      if (fCategoria) qs.set("categoria", fCategoria);
      if (fFornecedor) qs.set("fornecedor", fFornecedor);
      qs.set("situacao", fSituacao);

      const r = await fetch(`/api/contas/exportar?${qs}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        mostrar("erro", d.erro ?? "Não foi possível gerar a planilha.");
        return;
      }

      const blob = await r.blob();
      const nome =
        r.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        "contas-e-contratos.xlsx";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);

      mostrar("sucesso", `Planilha gerada com ${contas.length} contrato(s).`);
    } catch {
      mostrar("erro", "Falha ao gerar a planilha.");
    }
    setExportando(false);
  }

  return (
    <>
      <PageHeader
        icone={<Wallet size={21} />}
        titulo="Contas e contratos"
        descricao="O que a TI paga todo mês. Cada conta gera uma competência por período e alimenta o dashboard de custo."
        acoes={
          <button onClick={abrirNovo} className="btn-primary" disabled={fornecedores.length === 0}>
            <Plus size={16} />
            Nova conta
          </button>
        }
      />

      <div className="card mb-5 animate-fade-up no-print">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[210px] flex-1">
            <label className="label">Buscar</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-lube-300/50" />
              <input
                className="input pl-9"
                placeholder="Conta, contrato ou centro de custo..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          <div className="w-[190px]">
            <label className="label">Categoria</label>
            <select
              className="input"
              value={fCategoria}
              onChange={(e) => setFCategoria(e.target.value)}
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
              <option value="sem">Sem categoria</option>
            </select>
          </div>

          <div className="w-[180px]">
            <label className="label">Fornecedor</label>
            <select
              className="input"
              value={fFornecedor}
              onChange={(e) => setFFornecedor(e.target.value)}
            >
              <option value="">Todos</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>

          <div className="w-[135px]">
            <label className="label">Situação</label>
            <select className="input" value={fSituacao} onChange={(e) => setFSituacao(e.target.value)}>
              <option value="ativas">Ativas</option>
              <option value="inativas">Inativas</option>
              <option value="todas">Todas</option>
            </select>
          </div>

          <BotaoAcao
            onClick={exportar}
            carregando={exportando}
            className="btn-ghost"
            disabled={contas.length === 0}
            title={
              contas.length === 0
                ? "Nada para exportar com estes filtros"
                : "Baixar em Excel o que está na tela"
            }
          >
            <FileSpreadsheet size={15} />
            Exportar
          </BotaoAcao>
        </div>

        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"
          style={{ borderColor: "var(--color-border-soft)" }}
        >
          <span className="text-lube-200/55">
            {contas.length} de {lista.length} contrato(s)
            {filtrando && <span className="text-lube-300/70"> · filtro aplicado</span>}
          </span>
          <span>
            <span className="text-lube-200/55">Custo fixo mensal previsto: </span>
            <span className="font-extrabold text-white">{moeda(totalMensal)}</span>
          </span>
        </div>
      </div>

      {fornecedores.length === 0 && !carregando && (
        <div
          className="mb-5 rounded-xl border px-4 py-3 text-sm text-amber-100"
          style={{ borderColor: "rgba(201,133,0,.4)", background: "rgba(201,133,0,.1)" }}
        >
          Cadastre um fornecedor antes de criar contas.{" "}
          <a href="/fornecedores" className="font-bold underline underline-offset-2">
            Ir para fornecedores
          </a>
        </div>
      )}

      {carregando ? (
        <div className="flex items-center justify-center gap-3 py-16 text-sm text-lube-200/55">
          <Loader2 size={18} className="animate-spin" /> Carregando...
        </div>
      ) : contas.length === 0 ? (
        <div className="card">
          <Vazio
            titulo="Nenhuma conta cadastrada"
            descricao="Cadastre os contratos recorrentes: link de internet, telefonia, licenças, nuvem, suporte..."
            Icone={Wallet}
          />
        </div>
      ) : (
        <div className="table-wrap animate-fade-up">
          <table className="tbl">
            <thead>
              <tr>
                <th>Conta / Contrato</th>
                <th>Fornecedor</th>
                <th>Categoria</th>
                <th className="text-right">Valor previsto</th>
                <th className="text-center">Vencimento</th>
                <th className="text-center">Exige</th>
                <th className="text-center">Robô</th>
                <th className="text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => {
                const cat = categoria(c.categoria_id);
                return (
                  <tr key={c.id} className={c.ativo ? "" : "opacity-50"}>
                    <td>
                      <div className="font-bold text-white">{c.descricao}</div>
                      <div className="text-xs text-lube-200/50">
                        {c.identificador ? `${c.identificador} · ` : ""}
                        {PERIODICIDADE[c.periodicidade]}
                        {c.centro_custo ? ` · ${c.centro_custo}` : ""}
                      </div>
                    </td>
                    <td className="text-lube-100">{nomeFornecedor(c.fornecedor_id)}</td>
                    <td>
                      {cat ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-lube-100">
                          <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ background: cat.cor, outline: "2px solid #0e1742" }}
                          />
                          {cat.nome}
                        </span>
                      ) : (
                        <span className="text-xs text-lube-200/40">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right font-bold text-white">
                      {moeda(Number(c.valor_previsto))}
                    </td>
                    <td className="text-center text-lube-100">
                      {c.dia_vencimento ? `dia ${c.dia_vencimento}` : "—"}
                    </td>
                    <td>
                      <div className="flex justify-center gap-1">
                        {c.exige_nota_fiscal && (
                          <span className="badge border-lube-400/30 bg-lube-500/12 text-lube-100">NF</span>
                        )}
                        {c.exige_fatura && (
                          <span className="badge border-lube-400/30 bg-lube-500/12 text-lube-100">Fat</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex justify-center">
                        {c.cobranca_ativa ? (
                          <span title={`Cobra a partir de ${c.dias_antes_vencimento} dias antes, a cada ${c.intervalo_cobranca_dias} dias, até ${c.max_cobrancas}x`}>
                            <Bot size={16} className="text-emerald-300" />
                          </span>
                        ) : (
                          <span title="Cobrança automática desligada para esta conta">
                            <BellOff size={16} className="text-lube-300/45" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => abrirEdicao(c)}
                          className="rounded-lg p-1.5 text-lube-300 transition hover:bg-white/10 hover:text-white"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => excluir(c)}
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
        titulo={editando ? "Editar conta" : "Nova conta"}
        descricao="Defina o contrato e como o robô deve cobrar os documentos."
        largura="max-w-3xl"
      >
        <form onSubmit={salvar} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Fornecedor *</label>
              <select
                className="input"
                required
                value={form.fornecedor_id}
                onChange={(e) => setForm({ ...form, fornecedor_id: e.target.value })}
              >
                <option value="">Selecione...</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Categoria de custo</label>
              <select
                className="input"
                value={form.categoria_id}
                onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
              >
                <option value="">Sem categoria</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Descrição *</label>
              <input
                className="input"
                required
                placeholder="ex.: Link dedicado 300 Mbps — Matriz"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Identificador (contrato / linha)</label>
              <input
                className="input"
                placeholder="ex.: 4521-8899"
                value={form.identificador}
                onChange={(e) => setForm({ ...form, identificador: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Centro de custo</label>
              <input
                className="input"
                value={form.centro_custo}
                onChange={(e) => setForm({ ...form, centro_custo: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Valor previsto (R$) *</label>
              <input
                type="number"
                step="0.01"
                className="input"
                required
                value={form.valor_previsto}
                onChange={(e) => setForm({ ...form, valor_previsto: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Periodicidade</label>
              <select
                className="input"
                value={form.periodicidade}
                onChange={(e) => setForm({ ...form, periodicidade: e.target.value as Periodicidade })}
              >
                {Object.entries(PERIODICIDADE).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Dia do vencimento</label>
              <input
                type="number"
                min={1}
                max={31}
                className="input"
                value={form.dia_vencimento}
                onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })}
              />
            </div>
          </div>

          {/* ---------- regras do robô ---------- */}
          <div
            className="rounded-xl border p-4"
            style={{ borderColor: "var(--color-border-soft)", background: "rgba(70,89,224,.06)" }}
          >
            <h4 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-white">
              <Bot size={16} className="text-lube-300" />
              Automação de documentos
            </h4>

            <div className="mb-4 flex flex-wrap gap-5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-lube-100">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#4659e0]"
                  checked={form.exige_nota_fiscal}
                  onChange={(e) => setForm({ ...form, exige_nota_fiscal: e.target.checked })}
                />
                Exige nota fiscal
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-lube-100">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#4659e0]"
                  checked={form.exige_fatura}
                  onChange={(e) => setForm({ ...form, exige_fatura: e.target.checked })}
                />
                Exige fatura/boleto
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-lube-100">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#4659e0]"
                  checked={form.cobranca_ativa}
                  onChange={(e) => setForm({ ...form, cobranca_ativa: e.target.checked })}
                />
                Cobrar automaticamente
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Começar a cobrar</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={60}
                    className="input"
                    value={form.dias_antes_vencimento}
                    onChange={(e) => setForm({ ...form, dias_antes_vencimento: e.target.value })}
                  />
                  <span className="whitespace-nowrap text-xs text-lube-200/55">dias antes</span>
                </div>
              </div>
              <div>
                <label className="label">Intervalo entre cobranças</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    className="input"
                    value={form.intervalo_cobranca_dias}
                    onChange={(e) => setForm({ ...form, intervalo_cobranca_dias: e.target.value })}
                  />
                  <span className="text-xs text-lube-200/55">dias</span>
                </div>
              </div>
              <div>
                <label className="label">Máximo de cobranças</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="input"
                  value={form.max_cobrancas}
                  onChange={(e) => setForm({ ...form, max_cobrancas: e.target.value })}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="label">Palavras-chave do e-mail</label>
              <input
                className="input"
                placeholder="ex.: link dedicado, 300mb, matriz"
                value={form.palavras_chave}
                onChange={(e) => setForm({ ...form, palavras_chave: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-lube-200/45">
                Só é necessário quando o mesmo fornecedor tem mais de um contrato — ajuda o robô a
                saber a qual deles o e-mail se refere.
              </p>
            </div>
          </div>

          <div>
            <label className="label">Observações</label>
            <textarea
              className="input min-h-[62px]"
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-lube-100">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#4659e0]"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Conta ativa (gera competência todo período)
          </label>

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
