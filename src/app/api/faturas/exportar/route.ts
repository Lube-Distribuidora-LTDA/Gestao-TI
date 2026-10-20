import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sessaoAtual } from "@/lib/sessao-servidor";
import { gerarPlanilha } from "@/lib/planilha";
import { consultarFaturas } from "@/lib/consulta-faturas";
import { STATUS_FATURA, type StatusFatura } from "@/lib/tipos";
import { competenciaLabel, data as dataBR } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type FaturaExport = {
  fornecedor_nome: string;
  conta_descricao: string;
  identificador: string | null;
  categoria_nome: string | null;
  competencia: string;
  vencimento: string;
  valor_efetivo: number;
  status: StatusFatura;
  numero_nota: string | null;
  qtd_documentos: number;
  pagamento_automatico: boolean;
};

const ROTULO_FILTRO: Record<string, string> = {
  aguardando: "Aguardando documento",
  vencidas: "Vencidas",
  hoje: "Vence hoje",
  urgente: "Até 2 semanas",
  mes: "Vence este mês",
  revisao: "A conferir",
};

/** Exporta as faturas em Excel com exatamente o recorte da tela (mesma consulta da lista). */
export async function GET(req: Request) {
  if (!(await sessaoAtual())) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const p = new URL(req.url).searchParams;
  const { data, error } = await consultarFaturas(p);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  const linhas = (data ?? []) as unknown as FaturaExport[];

  /* Os filtros vão escritos na planilha, com o nome que apareceu na tela. Sem
     isso, um arquivo com 6 de 30 faturas parece a lista inteira. */
  const db = supabaseAdmin();
  const nomes = async (tabela: string, ids: string) => {
    const lista = ids.split(",").filter(Boolean);
    const { data: r } = await db.from(tabela).select("nome").in("id", lista);
    return ((r ?? []) as Array<{ nome: string }>).map((x) => x.nome).join(", ");
  };

  const filtros: Array<{ rotulo: string; valor: string }> = [];
  const de = p.get("de"), ate = p.get("ate");
  filtros.push({
    rotulo: "Vencimento",
    valor:
      de || ate
        ? `${de ? dataBR(de) : "…"} a ${ate ? dataBR(ate) : "…"}`
        : p.get("tudo") === "1" || p.get("competencia") || p.get("filtro") === "vencidas"
          ? "Todos"
          : "Mês atual + atrasadas",
  });
  if (p.get("competencia")) {
    filtros.push({
      rotulo: "Competência",
      valor: p.get("competencia")!.split(",").map((c) => competenciaLabel(c)).join(", "),
    });
  }
  if (p.get("status")) {
    filtros.push({
      rotulo: "Situação",
      valor: p
        .get("status")!
        .split(",")
        .map((s) => STATUS_FATURA[s as StatusFatura]?.label ?? s)
        .join(", "),
    });
  }
  if (p.get("fornecedor")) filtros.push({ rotulo: "Fornecedor", valor: await nomes("fornecedores", p.get("fornecedor")!) });
  if (p.get("categoria")) filtros.push({ rotulo: "Categoria", valor: await nomes("categorias_custo", p.get("categoria")!) });
  if (p.get("filtro")) filtros.push({ rotulo: "Atalho", valor: ROTULO_FILTRO[p.get("filtro")!] ?? p.get("filtro")! });
  if (p.get("busca")) filtros.push({ rotulo: "Busca", valor: p.get("busca")! });

  const buffer = await gerarPlanilha<FaturaExport>({
    titulo: "Faturas e notas",
    subtitulo: "Gestão de TI",
    filtros,
    linhas,
    colunas: [
      { titulo: "Fornecedor", largura: 26, valor: (f) => f.fornecedor_nome },
      {
        titulo: "Conta / Contrato",
        largura: 32,
        valor: (f) => f.conta_descricao + (f.identificador ? ` · ${f.identificador}` : ""),
      },
      { titulo: "Categoria", largura: 21, valor: (f) => f.categoria_nome ?? "—" },
      { titulo: "Competência", largura: 12, valor: (f) => competenciaLabel(f.competencia), formato: "centro" },
      {
        titulo: "Vencimento",
        largura: 14,
        valor: (f) => dataBR(f.vencimento) + (f.pagamento_automatico ? " (débito)" : ""),
        formato: "centro",
      },
      { titulo: "Valor", largura: 15, valor: (f) => Number(f.valor_efetivo ?? 0), formato: "moeda", somar: true },
      { titulo: "Situação", largura: 22, valor: (f) => STATUS_FATURA[f.status]?.label ?? f.status, formato: "centro" },
      { titulo: "Nº da nota", largura: 13, valor: (f) => f.numero_nota || "—", formato: "centro" },
      { titulo: "Documentos", largura: 12, valor: (f) => f.qtd_documentos ?? 0, formato: "centro" },
    ],
  });

  const hoje = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="faturas-${hoje}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
