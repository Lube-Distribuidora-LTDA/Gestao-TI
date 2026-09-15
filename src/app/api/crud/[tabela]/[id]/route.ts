import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { TABELAS, filtrarCampos, traduzirErro } from "@/lib/crud-config";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ tabela: string; id: string }> }) {
  const { tabela, id } = await ctx.params;
  if (!TABELAS[tabela]) return NextResponse.json({ erro: "Recurso não encontrado." }, { status: 404 });

  if (!podeEscrever(await sessaoAtual())) {
    return NextResponse.json({ erro: "Seu perfil não permite alterações." }, { status: 403 });
  }

  const corpo = filtrarCampos(tabela, await req.json());
  if (Object.keys(corpo).length === 0) {
    return NextResponse.json({ erro: "Nenhum campo válido enviado." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from(tabela)
    .update(corpo)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ erro: traduzirErro(error.message) }, { status: 400 });
  return NextResponse.json({ dados: data });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ tabela: string; id: string }> }) {
  const { tabela, id } = await ctx.params;
  if (!TABELAS[tabela]) return NextResponse.json({ erro: "Recurso não encontrado." }, { status: 404 });

  const sessao = await sessaoAtual();
  if (!podeEscrever(sessao)) {
    return NextResponse.json({ erro: "Seu perfil não permite exclusões." }, { status: 403 });
  }

  const { error } = await supabaseAdmin().from(tabela).delete().eq("id", id);

  if (error) {
    // o banco protege contratos/faturas com FK; explicamos em vez de vazar o erro cru
    if (/violates foreign key/i.test(error.message)) {
      return NextResponse.json(
        {
          erro:
            "Este registro está em uso por outros cadastros (contas ou faturas). " +
            "Desative-o em vez de excluir, para preservar o histórico.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ erro: traduzirErro(error.message) }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
