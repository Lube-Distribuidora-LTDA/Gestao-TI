import { NextResponse } from "next/server";
import { supabaseAdmin, BUCKET_DOCUMENTOS } from "@/lib/supabase";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Levanta o que será apagado junto, para a tela avisar antes de confirmar. */
async function levantarImpacto(id: string) {
  const db = supabaseAdmin();

  const { data: contas } = await db.from("contas").select("id, descricao").eq("fornecedor_id", id);
  const idsContas = (contas ?? []).map((c) => c.id);

  if (idsContas.length === 0) {
    return { contas: [], faturas: 0, documentos: 0, cobrancas: 0, valorTotal: 0, paths: [] };
  }

  const { data: faturas } = await db
    .from("faturas")
    .select("id, valor_previsto, valor_real")
    .in("conta_id", idsContas);
  const idsFaturas = (faturas ?? []).map((f) => f.id);

  const { data: documentos } = idsFaturas.length
    ? await db.from("documentos").select("storage_path").in("fatura_id", idsFaturas)
    : { data: [] };

  const { count: cobrancas } = idsFaturas.length
    ? await db.from("cobrancas").select("id", { count: "exact", head: true }).in("fatura_id", idsFaturas)
    : { count: 0 };

  return {
    contas: (contas ?? []).map((c) => c.descricao as string),
    faturas: idsFaturas.length,
    documentos: (documentos ?? []).length,
    cobrancas: cobrancas ?? 0,
    valorTotal: (faturas ?? []).reduce(
      (s, f) => s + Number(f.valor_real ?? f.valor_previsto ?? 0),
      0
    ),
    paths: (documentos ?? []).map((d) => d.storage_path).filter(Boolean) as string[],
  };
}

/** Prévia do impacto — a tela chama antes de perguntar se pode excluir. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { paths, ...impacto } = await levantarImpacto(id);
  void paths; // os caminhos só interessam na hora de apagar
  return NextResponse.json(impacto);
}

/**
 * Exclui o fornecedor e tudo que depende dele.
 *
 * O banco já cuida da cascata (contratos, competências, documentos e
 * cobranças). O que ele não faz é limpar os arquivos no storage — sem isso os
 * PDFs e XMLs ficariam órfãos, ocupando espaço para sempre.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!podeEscrever(await sessaoAtual())) {
    return NextResponse.json({ erro: "Seu perfil não permite exclusões." }, { status: 403 });
  }

  const db = supabaseAdmin();

  const { data: fornecedor } = await db
    .from("fornecedores")
    .select("nome")
    .eq("id", id)
    .maybeSingle();

  if (!fornecedor) {
    return NextResponse.json({ erro: "Fornecedor não encontrado." }, { status: 404 });
  }

  const impacto = await levantarImpacto(id);

  // os arquivos primeiro: depois do delete não há mais como saber quais eram
  if (impacto.paths.length > 0) {
    // o storage aceita um lote por vez; 100 é folgado para o volume daqui
    for (let i = 0; i < impacto.paths.length; i += 100) {
      await db.storage.from(BUCKET_DOCUMENTOS).remove(impacto.paths.slice(i, i + 100));
    }
  }

  const { error } = await db.from("fornecedores").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    nome: fornecedor.nome,
    removidos: {
      contas: impacto.contas.length,
      faturas: impacto.faturas,
      documentos: impacto.documentos,
      cobrancas: impacto.cobrancas,
    },
  });
}
