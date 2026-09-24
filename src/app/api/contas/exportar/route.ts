import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sessaoAtual } from "@/lib/sessao-servidor";
import { gerarPlanilha } from "@/lib/planilha";
import { PERIODICIDADE, type Periodicidade } from "@/lib/tipos";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ContaExport = {
  descricao: string;
  identificador: string | null;
  valor_previsto: number;
  periodicidade: Periodicidade;
  dia_vencimento: number | null;
  exige_nota_fiscal: boolean;
  exige_fatura: boolean;
  exige_recibo: boolean;
  pagamento_automatico: boolean;
  documento_via_link: boolean;
  cobranca_ativa: boolean;
  centro_custo: string | null;
  ativo: boolean;
  observacoes: string | null;
  fornecedores: { nome: string; canal_cobranca: string } | null;
  categorias_custo: { nome: string } | null;
};

/** Exporta contas e contratos em Excel, com os mesmos filtros da tela. */
export async function GET(req: Request) {
  if (!(await sessaoAtual())) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const url = new URL(req.url);
  const busca = url.searchParams.get("busca") ?? "";
  const categoria = url.searchParams.get("categoria") ?? "";
  const fornecedor = url.searchParams.get("fornecedor") ?? "";
  const situacao = url.searchParams.get("situacao") ?? "ativas";

  const db = supabaseAdmin();

  let q = db
    .from("contas")
    .select(
      "descricao, identificador, valor_previsto, periodicidade, dia_vencimento, exige_nota_fiscal, exige_fatura, exige_recibo, pagamento_automatico, documento_via_link, cobranca_ativa, centro_custo, ativo, observacoes, fornecedores(nome, canal_cobranca), categorias_custo(nome)"
    )
    .order("descricao");

  if (categoria === "sem") q = q.is("categoria_id", null);
  else if (categoria) q = q.eq("categoria_id", categoria);

  if (fornecedor) q = q.eq("fornecedor_id", fornecedor);
  if (situacao === "ativas") q = q.eq("ativo", true);
  else if (situacao === "inativas") q = q.eq("ativo", false);

  if (busca) {
    const termo = busca.replace(/[%,()]/g, "");
    q = q.or(`descricao.ilike.%${termo}%,identificador.ilike.%${termo}%,centro_custo.ilike.%${termo}%`);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  const linhas = (data ?? []) as unknown as ContaExport[];

  /* Os filtros vão escritos na planilha, com o nome que apareceu na tela. Sem
     isso, um arquivo com 6 de 25 contratos parece a lista inteira. */
  const nomeDe = async (tabela: string, id: string) => {
    const { data: r } = await db.from(tabela).select("nome").eq("id", id).maybeSingle();
    return (r as { nome?: string } | null)?.nome ?? id;
  };

  const filtros: Array<{ rotulo: string; valor: string }> = [];
  if (busca) filtros.push({ rotulo: "Busca", valor: busca });
  if (categoria) {
    filtros.push({
      rotulo: "Categoria",
      valor: categoria === "sem" ? "Sem categoria" : await nomeDe("categorias_custo", categoria),
    });
  }
  if (fornecedor) filtros.push({ rotulo: "Fornecedor", valor: await nomeDe("fornecedores", fornecedor) });
  filtros.push({
    rotulo: "Situação",
    valor: situacao === "ativas" ? "Ativas" : situacao === "inativas" ? "Inativas" : "Todas",
  });

  const exige = (c: ContaExport) => {
    if (c.documento_via_link) return "Link do portal";
    return (
      [
        c.exige_nota_fiscal ? "NF" : null,
        c.exige_fatura ? "Boleto" : null,
        c.exige_recibo ? "Recibo" : null,
      ]
        .filter(Boolean)
        .join(" + ") || "—"
    );
  };

  const buffer = await gerarPlanilha<ContaExport>({
    titulo: "Contas e contratos",
    subtitulo: "Gestão de TI",
    filtros,
    linhas,
    colunas: [
      { titulo: "Conta / Contrato", largura: 30, valor: (c) => c.descricao },
      { titulo: "Fornecedor", largura: 24, valor: (c) => c.fornecedores?.nome ?? "—" },
      { titulo: "Categoria", largura: 21, valor: (c) => c.categorias_custo?.nome ?? "—" },
      { titulo: "Identificador", largura: 14, valor: (c) => c.identificador || "—" },
      {
        titulo: "Valor previsto",
        largura: 15,
        valor: (c) => Number(c.valor_previsto ?? 0),
        formato: "moeda",
        somar: true,
      },
      {
        titulo: "Periodicidade",
        largura: 13,
        valor: (c) => PERIODICIDADE[c.periodicidade] ?? c.periodicidade,
        formato: "centro",
      },
      {
        titulo: "Vencimento",
        largura: 12,
        valor: (c) =>
          c.dia_vencimento ? (c.pagamento_automatico ? `débito dia ${c.dia_vencimento}` : `dia ${c.dia_vencimento}`) : "—",
        formato: "centro",
      },
      { titulo: "Exige", largura: 16, valor: (c) => exige(c), formato: "centro" },
      {
        titulo: "Cobrança",
        largura: 14,
        valor: (c) =>
          !c.cobranca_ativa
            ? "desligada"
            : c.fornecedores?.canal_cobranca === "whatsapp"
              ? "WhatsApp"
              : "automática",
        formato: "centro",
      },
      { titulo: "Centro de custo", largura: 16, valor: (c) => c.centro_custo || "—" },
      { titulo: "Situação", largura: 10, valor: (c) => (c.ativo ? "Ativa" : "Inativa"), formato: "centro" },
      { titulo: "Observações", largura: 52, valor: (c) => c.observacoes || "" },
    ],
  });

  const hoje = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="contas-e-contratos-${hoje}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
