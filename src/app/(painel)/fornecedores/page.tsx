"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2, Plus, Pencil, Trash2, Mail, Phone, Loader2, AtSign, MessageCircle,
} from "lucide-react";
import { FaixaFiltros, Segmento, BuscaFiltro } from "@/components/Filtros";
import { PageHeader, Modal, Vazio, Aviso, useAviso, BotaoAcao, Badge } from "@/components/UI";
import { cnpjFmt, moeda, telFmt } from "@/lib/format";

type Fornecedor = {
  id: string;
  nome: string;
  razao_social: string | null;
  cnpj: string | null;
  email_cobranca: string | null;
  emails_remetentes: string[];
  telefone: string | null;
  contato_nome: string | null;
  site: string | null;
  observacoes: string | null;
  ativo: boolean;
  canal_cobranca: "email" | "whatsapp";
  whatsapp: string | null;
};

const VAZIO = {
  nome: "", razao_social: "", cnpj: "", email_cobranca: "",
  emails_remetentes: "", telefone: "", contato_nome: "", site: "",
  observacoes: "", ativo: true,
  canal_cobranca: "email" as "email" | "whatsapp", whatsapp: "",
};

export default function FornecedoresPage() {
  const { aviso, mostrar, limpar } = useAviso();
  const [lista, setLista] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  // mesmo padrão de Contas: abre nos ativos, com o segmento para ver os encerrados
  const [situacao, setSituacao] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ ...VAZIO });

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await fetch(`/api/crud/fornecedores?busca=${encodeURIComponent(busca)}`);
    const d = await r.json();
    if (r.ok) setLista(d.dados);
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

  function abrirEdicao(f: Fornecedor) {
    setForm({
      nome: f.nome,
      razao_social: f.razao_social ?? "",
      cnpj: f.cnpj ?? "",
      email_cobranca: f.email_cobranca ?? "",
      emails_remetentes: (f.emails_remetentes ?? []).join(", "),
      telefone: f.telefone ?? "",
      contato_nome: f.contato_nome ?? "",
      site: f.site ?? "",
      observacoes: f.observacoes ?? "",
      ativo: f.ativo,
      canal_cobranca: f.canal_cobranca ?? "email",
      whatsapp: f.whatsapp ?? "",
    });
    setEditando(f.id);
    setModal(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);

    const corpo = {
      ...form,
      emails_remetentes: form.emails_remetentes
        .split(/[,;\n]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      cnpj: form.cnpj.replace(/\D/g, "") || null,
      /* Guardado só com dígitos: é assim que o link wa.me espera o número,
         e assim "(27) 99999-9999" e "27999999999" viram a mesma coisa. */
      whatsapp: form.whatsapp.replace(/\D/g, "") || null,
      email_cobranca: form.email_cobranca.trim() || null,
    };

    const r = await fetch(
      editando ? `/api/crud/fornecedores/${editando}` : "/api/crud/fornecedores",
      {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }
    );
    const d = await r.json();
    setSalvando(false);

    if (r.ok) {
      mostrar("sucesso", editando ? "Fornecedor atualizado." : "Fornecedor cadastrado.");
      setModal(false);
      carregar();
    } else {
      mostrar("erro", d.erro ?? "Não foi possível salvar.");
    }
  }

  /**
   * Excluir leva junto contratos, competências, documentos e cobranças.
   * Por isso o impacto é levantado antes e mostrado na confirmação: sem esse
   * aviso dá para apagar anos de histórico achando que se removeu só um nome
   * da lista.
   */
  async function excluir(f: Fornecedor) {
    let aviso = `Excluir o fornecedor "${f.nome}"?`;

    try {
      const r = await fetch(`/api/fornecedores/${f.id}`);
      const i = await r.json();

      if (r.ok && (i.contas?.length > 0 || i.faturas > 0)) {
        const linhas = [
          `Excluir "${f.nome}" apaga também:`,
          "",
          ...(i.contas?.length
            ? [`• ${i.contas.length} contrato(s): ${i.contas.slice(0, 6).join(", ")}${i.contas.length > 6 ? "..." : ""}`]
            : []),
          ...(i.faturas ? [`• ${i.faturas} competência(s) de fatura`] : []),
          ...(i.documentos ? [`• ${i.documentos} documento(s) — notas e boletos guardados`] : []),
          ...(i.cobrancas ? [`• ${i.cobrancas} registro(s) de cobrança enviada`] : []),
          ...(i.valorTotal > 0 ? ["", `Some ${moeda(i.valorTotal)} em histórico de custo,`, "que some do dashboard."] : []),
          "",
          "Não há como desfazer. Continuar?",
        ];
        aviso = linhas.join("\n");
      }
    } catch {
      // se o levantamento falhar, ainda dá para excluir — só sem o detalhe
      aviso = `Excluir "${f.nome}" e todos os contratos, faturas e documentos ligados a ele?\n\nNão há como desfazer.`;
    }

    if (!confirm(aviso)) return;

    const r = await fetch(`/api/fornecedores/${f.id}`, { method: "DELETE" });
    const d = await r.json();

    if (r.ok) {
      const rem = d.removidos ?? {};
      const extras = [
        rem.contas ? `${rem.contas} contrato(s)` : null,
        rem.faturas ? `${rem.faturas} fatura(s)` : null,
        rem.documentos ? `${rem.documentos} documento(s)` : null,
      ].filter(Boolean);

      mostrar(
        "sucesso",
        extras.length
          ? `Fornecedor excluído, junto com ${extras.join(", ")}.`
          : "Fornecedor excluído."
      );
      carregar();
    } else {
      mostrar("erro", d.erro ?? "Não foi possível excluir.");
    }
  }

  const visiveis = lista.filter((f) =>
    situacao === "todos" ? true : situacao === "ativos" ? f.ativo : !f.ativo
  );

  return (
    <>
      <PageHeader
        icone={<Building2 size={21} />}
        titulo="Fornecedores"
        descricao="Quem presta serviço para a TI. Os e-mails cadastrados aqui ensinam o robô a reconhecer as notas."
        acoes={
          <button onClick={abrirNovo} className="btn-primary">
            <Plus size={16} />
            Novo fornecedor
          </button>
        }
      />

      <FaixaFiltros>
        <Segmento
          valor={situacao}
          aoMudar={setSituacao}
          opcoes={[
            { v: "ativos", rotulo: "Ativos", n: lista.filter((f) => f.ativo).length },
            { v: "inativos", rotulo: "Inativos", n: lista.filter((f) => !f.ativo).length },
            { v: "todos", rotulo: "Todos", n: lista.length },
          ]}
        />
        <BuscaFiltro valor={busca} aoMudar={setBusca} placeholder="Nome, CNPJ ou e-mail…" />
      </FaixaFiltros>

      {carregando ? (
        <div className="flex items-center justify-center gap-3 py-16 text-sm text-t3">
          <Loader2 size={18} className="animate-spin" /> Carregando...
        </div>
      ) : lista.length === 0 ? (
        <div className="card">
          <Vazio
            titulo="Nenhum fornecedor cadastrado"
            descricao="Comece cadastrando quem emite as notas: operadora de link, telefonia, licenças, nuvem..."
            Icone={Building2}
            acao={
              <button onClick={abrirNovo} className="btn-primary">
                <Plus size={16} /> Cadastrar o primeiro
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visiveis.length === 0 && (
            <div className="col-span-full py-10 text-center text-sm text-t3">Nada com estes filtros</div>
          )}
          {visiveis.map((f, i) => (
            <div
              key={f.id}
              className="card card-hover card-glow animate-fade-up"
              style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-extrabold text-t1">{f.nome}</h3>
                  {f.razao_social && (
                    <p className="truncate text-xs text-t3">{f.razao_social}</p>
                  )}
                  {f.cnpj && <p className="mt-0.5 text-xs text-t3">{cnpjFmt(f.cnpj)}</p>}
                </div>
                {!f.ativo && (
                  <Badge classe="border-t3/30 bg-t3/10 text-t3">Inativo</Badge>
                )}
              </div>

              <div className="mt-3.5 space-y-1.5 text-xs">
                {/* Como este fornecedor é cobrado vem primeiro: é o que decide
                    se o robô age sozinho ou se a cobrança depende de alguém. */}
                {f.canal_cobranca === "whatsapp" && (
                  <div className="flex items-center gap-2 font-semibold text-ok/85">
                    <MessageCircle size={12.5} className="shrink-0" />
                    <span>Cobrança por WhatsApp{f.whatsapp ? ` · ${telFmt(f.whatsapp)}` : ""}</span>
                  </div>
                )}
                {f.email_cobranca && (
                  <div className="flex items-center gap-2 text-t2">
                    <Mail size={12.5} className="shrink-0 text-t3" />
                    <span className="truncate">{f.email_cobranca}</span>
                  </div>
                )}
                {f.telefone && (
                  <div className="flex items-center gap-2 text-t2">
                    <Phone size={12.5} className="shrink-0 text-t3" />
                    {f.telefone}
                    {f.contato_nome && <span className="text-t3">· {f.contato_nome}</span>}
                  </div>
                )}
                {(f.emails_remetentes ?? []).length > 0 && (
                  <div className="flex items-start gap-2 text-t3">
                    <AtSign size={12.5} className="mt-0.5 shrink-0 text-t3" />
                    <span className="break-all">
                      {(f.emails_remetentes ?? []).join(", ")}
                    </span>
                  </div>
                )}
              </div>

              <div
                className="mt-4 flex justify-end gap-1 border-t pt-3"
                style={{ borderColor: "var(--color-border-soft)" }}
              >
                <button
                  onClick={() => abrirEdicao(f)}
                  className="rounded-lg p-2 text-t3 transition hover:bg-white/10 hover:text-t1"
                  title="Editar"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => excluir(f)}
                  className="rounded-lg p-2 text-t3 transition hover:bg-perigo/20 hover:text-perigo"
                  title="Excluir"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        aberto={modal}
        aoFechar={() => setModal(false)}
        titulo={editando ? "Editar fornecedor" : "Novo fornecedor"}
        descricao="Os e-mails de remetente são a chave para o robô reconhecer as notas automaticamente."
      >
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Nome *</label>
              <input
                className="input"
                required
                placeholder="ex.: Vivo Empresas"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Razão social</label>
              <input
                className="input"
                value={form.razao_social}
                onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
              />
            </div>
            <div>
              <label className="label">CNPJ</label>
              <input
                className="input"
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Como cobrar a nota deste fornecedor</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { v: "email", rot: "Por e-mail", sub: "O robô cobra sozinho", Icone: Mail },
                  { v: "whatsapp", rot: "Por WhatsApp", sub: "Você cobra à mão, pelo painel", Icone: MessageCircle },
                ] as const
              ).map(({ v, rot, sub, Icone }) => {
                const ativo = form.canal_cobranca === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm({ ...form, canal_cobranca: v })}
                    className="flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition"
                    style={
                      ativo
                        ? { borderColor: "rgba(70,89,224,.75)", background: "rgba(70,89,224,.16)" }
                        : { borderColor: "var(--color-border-soft)", background: "transparent" }
                    }
                  >
                    <Icone
                      size={15}
                      className={`mt-0.5 shrink-0 ${ativo ? "text-t1" : "text-t3"}`}
                    />
                    <span className="min-w-0">
                      <span
                        className={`block text-sm font-bold ${ativo ? "text-t1" : "text-t2"}`}
                      >
                        {rot}
                      </span>
                      <span className="block text-[11px] text-t3">{sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {form.canal_cobranca === "whatsapp" ? (
            <div>
              <label className="label">WhatsApp do fornecedor *</label>
              <input
                className="input"
                required
                placeholder="(27) 99999-9999"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-t3">
                É deste número que sai o botão na tela de faturas. Com DDD; se for de fora do
                Brasil, comece com o código do país.
              </p>
            </div>
          ) : null}

          <div>
            <label className="label">
              E-mail de cobrança {form.canal_cobranca === "email" ? "*" : ""}
            </label>
            <input
              type="email"
              className="input"
              required={form.canal_cobranca === "email"}
              placeholder="financeiro@fornecedor.com.br"
              value={form.email_cobranca}
              onChange={(e) => setForm({ ...form, email_cobranca: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-t3">
              {form.canal_cobranca === "email"
                ? "Para onde o sistema envia a cobrança da nota fiscal."
                : "Opcional neste caso — a cobrança sai pelo WhatsApp. Guardar o endereço ainda ajuda o robô a reconhecer os documentos quando eles chegarem."}
            </p>
          </div>

          <div>
            <label className="label">E-mails que ele usa para enviar documentos</label>
            <textarea
              className="input min-h-[74px]"
              placeholder="nfe@fornecedor.com.br, faturamento@fornecedor.com.br, @fornecedor.com.br"
              value={form.emails_remetentes}
              onChange={(e) => setForm({ ...form, emails_remetentes: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-t3">
              Separe por vírgula. Use <strong>@dominio.com.br</strong> para aceitar qualquer
              remetente daquele domínio — é assim que o robô liga o e-mail recebido a este fornecedor.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Telefone</label>
              <input
                className="input"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Pessoa de contato</label>
              <input
                className="input"
                value={form.contato_nome}
                onChange={(e) => setForm({ ...form, contato_nome: e.target.value })}
              />
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

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-t1">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#4659e0]"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Fornecedor ativo
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
