"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilePlus2, Plus, Search, Pencil, Trash2, Loader2, Upload, FileText,
  ExternalLink, CheckCircle2,
} from "lucide-react";
import {
  PageHeader, Modal, Vazio, Aviso, useAviso, BotaoAcao, Badge, KpiCard,
} from "@/components/UI";
import { moeda, data, hojeISO, dataHora, tamanhoArquivo } from "@/lib/format";
import { STATUS_FATURA, TIPO_DOCUMENTO, type StatusFatura, type TipoDocumento } from "@/lib/tipos";

type Nota = {
  id: string;
  empresa: string;
  cnpj: string | null;
  servico: string;
  descricao: string | null;
  numero_nota: string | null;
  valor: number;
  valor_bruto: number | null;
  data_servico: string | null;
  data_nota: string;
  vencimento: string | null;
  categoria_id: string | null;
  centro_custo: string | null;
  status: StatusFatura;
  entregue_em: string | null;
  observacoes: string | null;
};

type Documento = {
  id: string;
  nome_arquivo: string;
  tipo: TipoDocumento;
  tamanho_bytes: number | null;
  recebido_em: string;
  storage_path: string | null;
};

const VAZIO = {
  empresa: "", cnpj: "", servico: "", descricao: "", numero_nota: "",
  valor: "", data_servico: "", data_nota: hojeISO(), vencimento: "",
  categoria_id: "", centro_custo: "", observacoes: "",
};

export default function NotasAvulsasPage() {
  const { aviso, mostrar, limpar } = useAviso();
  const [lista, setLista] = useState<Nota[]>([]);
  const [categorias, setCategorias] = useState<Array<{ id: string; nome: string; cor?: string }>>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ ...VAZIO });

  // anexos da nota aberta para edição
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [enviando, setEnviando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [n, c] = await Promise.all([
      fetch(`/api/crud/notas_avulsas?busca=${encodeURIComponent(busca)}`).then((r) => r.json()),
      fetch("/api/crud/categorias_custo?ativo=true").then((r) => r.json()),
    ]);
    setLista(n.dados ?? []);
    setCategorias(c.dados ?? []);
    setCarregando(false);
  }, [busca]);

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  async function carregarDocumentos(notaId: string) {
    const r = await fetch(`/api/notas-avulsas/${notaId}/documentos`);
    const d = await r.json();
    setDocumentos(r.ok ? d.dados ?? [] : []);
  }

  function abrirNovo() {
    setForm({ ...VAZIO });
    setEditando(null);
    setDocumentos([]);
    setModal(true);
  }

  function abrirEdicao(n: Nota) {
    setForm({
      empresa: n.empresa,
      cnpj: n.cnpj ?? "",
      servico: n.servico,
      descricao: n.descricao ?? "",
      numero_nota: n.numero_nota ?? "",
      valor: String(n.valor ?? ""),
      data_servico: n.data_servico ?? "",
      data_nota: n.data_nota,
      vencimento: n.vencimento ?? "",
      categoria_id: n.categoria_id ?? "",
      centro_custo: n.centro_custo ?? "",
      observacoes: n.observacoes ?? "",
    });
    setEditando(n.id);
    carregarDocumentos(n.id);
    setModal(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);

    const corpo = {
      ...form,
      valor: Number(form.valor || 0),
      categoria_id: form.categoria_id || null,
      data_servico: form.data_servico || null,
      vencimento: form.vencimento || null,
    };

    const r = await fetch(
      editando ? `/api/crud/notas_avulsas/${editando}` : "/api/crud/notas_avulsas",
      {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }
    );
    const d = await r.json();
    setSalvando(false);

    if (!r.ok) {
      mostrar("erro", d.erro ?? "Não foi possível salvar.");
      return;
    }

    mostrar("sucesso", editando ? "Nota atualizada." : "Nota lançada.");

    // ao criar, mantém o modal aberto para anexar o arquivo em seguida
    if (!editando && d.dados?.id) {
      setEditando(d.dados.id);
      setDocumentos([]);
      carregar();
    } else {
      setModal(false);
      carregar();
    }
  }

  async function enviarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo || !editando) return;

    setEnviando(true);
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    fd.append("nota_avulsa_id", editando);
    fd.append("tipo", "nota_fiscal");

    const r = await fetch("/api/documentos", { method: "POST", body: fd });
    const d = await r.json();
    setEnviando(false);
    if (inputArquivo.current) inputArquivo.current.value = "";

    if (r.ok) {
      mostrar("sucesso", "Nota anexada.");
      carregarDocumentos(editando);
    } else {
      mostrar("erro", d.erro ?? "Falha no envio.");
    }
  }

  async function abrirDocumento(id: string) {
    const r = await fetch(`/api/documentos/${id}`);
    const d = await r.json();
    if (r.ok) window.open(d.url, "_blank", "noopener");
    else mostrar("erro", d.erro ?? "Não foi possível abrir.");
  }

  async function marcarEntregue(n: Nota) {
    const r = await fetch(`/api/crud/notas_avulsas/${n.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "entregue_contabilidade", entregue_em: hojeISO() }),
    });
    if (r.ok) {
      mostrar("sucesso", "Marcada como assinada e entregue.");
      carregar();
    } else {
      mostrar("erro", "Não foi possível atualizar.");
    }
  }

  async function excluir(n: Nota) {
    if (!confirm(`Excluir a nota de "${n.empresa}" (${moeda(n.valor)})?\n\nO anexo também é apagado.`))
      return;
    const r = await fetch(`/api/crud/notas_avulsas/${n.id}`, { method: "DELETE" });
    if (r.ok) {
      mostrar("sucesso", "Nota excluída.");
      carregar();
    } else {
      mostrar("erro", "Não foi possível excluir.");
    }
  }

  const total = lista.reduce((s, n) => s + Number(n.valor ?? 0), 0);
  const doMes = lista.filter((n) => n.data_nota?.slice(0, 7) === hojeISO().slice(0, 7));
  const totalMes = doMes.reduce((s, n) => s + Number(n.valor ?? 0), 0);
  const pendentes = lista.filter((n) => n.status !== "entregue_contabilidade");

  return (
    <>
      <PageHeader
        icone={<FilePlus2 size={21} />}
        titulo="Notas avulsas"
        descricao="Serviços contratados por fora dos contratos mensais: uma manutenção, uma compra, um atendimento pontual."
        acoes={
          <button onClick={abrirNovo} className="btn-primary">
            <Plus size={16} />
            Lançar nota
          </button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard rotulo="Lançadas" valor={String(lista.length)} icone={<FilePlus2 size={20} />} cor="#3987e5" />
        <KpiCard rotulo="Total" valor={moeda(total)} icone={<FileText size={20} />} cor="#9085e9" atraso={60} />
        <KpiCard rotulo="Neste mês" valor={moeda(totalMes)} icone={<FileText size={20} />} cor="#199e70" atraso={120} />
        <KpiCard
          rotulo="A entregar"
          valor={String(pendentes.length)}
          icone={<CheckCircle2 size={20} />}
          cor={pendentes.length > 0 ? "#c98500" : "#199e70"}
          atraso={180}
        />
      </div>

      <div className="card mb-5 animate-fade-up">
        <div className="relative max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-lube-300/50" />
          <input
            className="input pl-9"
            placeholder="Empresa, serviço ou número da nota..."
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
            titulo="Nenhuma nota avulsa lançada"
            descricao="Use esta tela para os serviços que não têm contrato mensal: um conserto, uma instalação, uma compra pontual."
            Icone={FilePlus2}
            acao={
              <button onClick={abrirNovo} className="btn-primary">
                <Plus size={16} /> Lançar a primeira
              </button>
            }
          />
        </div>
      ) : (
        <div className="table-wrap animate-fade-up">
          <table className="tbl">
            <thead>
              <tr>
                <th>Empresa / Serviço</th>
                <th>Nota</th>
                <th>Data</th>
                <th>Vencimento</th>
                <th className="text-right">Valor</th>
                <th>Situação</th>
                <th className="text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((n) => {
                const est = STATUS_FATURA[n.status];
                const cat = categorias.find((c) => c.id === n.categoria_id);
                return (
                  <tr key={n.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-8 w-1 shrink-0 rounded-full"
                          style={{ background: cat?.cor ?? "#64748b" }}
                          title={cat?.nome ?? "Sem categoria"}
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-white">{n.empresa}</div>
                          <div className="truncate text-xs text-lube-200/55">{n.servico}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-lube-100">{n.numero_nota || "—"}</td>
                    <td className="whitespace-nowrap text-lube-100">{data(n.data_nota)}</td>
                    <td className="whitespace-nowrap text-lube-100">
                      {n.vencimento ? data(n.vencimento) : "—"}
                    </td>
                    <td className="whitespace-nowrap text-right font-bold text-white">
                      {moeda(Number(n.valor))}
                    </td>
                    <td>
                      <Badge classe={est.classe} ponto={est.ponto}>{est.label}</Badge>
                    </td>
                    <td>
                      <div className="flex justify-center gap-1">
                        {n.status !== "entregue_contabilidade" && (
                          <button
                            onClick={() => marcarEntregue(n)}
                            title="Assinado e entregue à contabilidade"
                            className="rounded-lg p-1.5 text-emerald-300/80 transition hover:bg-emerald-400/15 hover:text-emerald-200"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => abrirEdicao(n)}
                          className="rounded-lg p-1.5 text-lube-300 transition hover:bg-white/10 hover:text-white"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => excluir(n)}
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
        aoFechar={() => {
          setModal(false);
          carregar();
        }}
        titulo={editando ? "Nota avulsa" : "Lançar nota avulsa"}
        descricao="Serviço fora dos contratos mensais. O valor entra no custo do departamento."
        largura="max-w-3xl"
      >
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Empresa *</label>
              <input
                className="input"
                required
                placeholder="Quem prestou o serviço"
                value={form.empresa}
                onChange={(e) => setForm({ ...form, empresa: e.target.value })}
              />
            </div>
            <div>
              <label className="label">CNPJ</label>
              <input
                className="input"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Serviço realizado *</label>
            <input
              className="input"
              required
              placeholder="ex.: Troca da fonte do servidor de arquivos"
              value={form.servico}
              onChange={(e) => setForm({ ...form, servico: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Detalhes</label>
            <textarea
              className="input min-h-[70px]"
              placeholder="O que foi feito, peças trocadas, quem acompanhou..."
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Número da nota</label>
              <input
                className="input"
                placeholder="ex.: 4521"
                value={form.numero_nota}
                onChange={(e) => setForm({ ...form, numero_nota: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Valor (R$) *</label>
              <input
                type="number"
                step="0.01"
                className="input"
                required
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Categoria</label>
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
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Data do serviço</label>
              <input
                type="date"
                className="input"
                value={form.data_servico}
                onChange={(e) => setForm({ ...form, data_servico: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Data da nota *</label>
              <input
                type="date"
                className="input"
                required
                value={form.data_nota}
                onChange={(e) => setForm({ ...form, data_nota: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Vencimento</label>
              <input
                type="date"
                className="input"
                value={form.vencimento}
                onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
              />
            </div>
          </div>

          <div
            className="flex justify-end gap-2 border-t pt-4"
            style={{ borderColor: "var(--color-border-soft)" }}
          >
            <button
              type="button"
              onClick={() => {
                setModal(false);
                carregar();
              }}
              className="btn-ghost"
            >
              Fechar
            </button>
            <BotaoAcao type="submit" carregando={salvando} className="btn-primary">
              {editando ? "Salvar alterações" : "Lançar nota"}
            </BotaoAcao>
          </div>
        </form>

        {/* ---------- anexo: só depois da nota existir ---------- */}
        <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--color-border-soft)" }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-lube-300/85">
              Nota anexada {documentos.length > 0 && `(${documentos.length})`}
            </h3>
            <input
              ref={inputArquivo}
              type="file"
              className="hidden"
              onChange={enviarArquivo}
              accept=".pdf,.xml,.jpg,.jpeg,.png"
            />
            <BotaoAcao
              carregando={enviando}
              onClick={() => inputArquivo.current?.click()}
              disabled={!editando}
              className="btn-ghost !py-1.5 !text-xs"
            >
              <Upload size={13} />
              Anexar arquivo
            </BotaoAcao>
          </div>

          {!editando ? (
            <p
              className="rounded-xl border border-dashed px-4 py-5 text-center text-xs text-lube-200/45"
              style={{ borderColor: "var(--color-border-soft)" }}
            >
              Lance a nota primeiro; o anexo é liberado logo em seguida.
            </p>
          ) : documentos.length === 0 ? (
            <p
              className="rounded-xl border border-dashed px-4 py-5 text-center text-xs text-lube-200/45"
              style={{ borderColor: "var(--color-border-soft)" }}
            >
              Nenhum arquivo anexado ainda.
            </p>
          ) : (
            <div className="space-y-2">
              {documentos.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-xl border px-3.5 py-2.5"
                  style={{ borderColor: "var(--color-border-soft)", background: "rgba(255,255,255,.025)" }}
                >
                  <FileText size={16} className="shrink-0 text-lube-300" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-white">{d.nome_arquivo}</div>
                    <div className="text-[11px] text-lube-200/50">
                      {dataHora(d.recebido_em)} · {tamanhoArquivo(d.tamanho_bytes)} ·{" "}
                      {TIPO_DOCUMENTO[d.tipo]}
                    </div>
                  </div>
                  {d.storage_path && (
                    <button
                      onClick={() => abrirDocumento(d.id)}
                      className="rounded-lg p-2 text-lube-300 transition hover:bg-white/10 hover:text-white"
                      title="Abrir"
                    >
                      <ExternalLink size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {aviso && <Aviso tipo={aviso.tipo} mensagem={aviso.mensagem} aoFechar={limpar} />}
    </>
  );
}
