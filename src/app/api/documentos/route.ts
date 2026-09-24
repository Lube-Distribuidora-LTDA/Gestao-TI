import { NextResponse } from "next/server";
import { supabaseAdmin, BUCKET_DOCUMENTOS } from "@/lib/supabase";
import { sessaoAtual, podeEscrever } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Upload manual de nota/fatura direto pela tela. */
export async function POST(req: Request) {
  const sessao = await sessaoAtual();
  if (!podeEscrever(sessao)) {
    return NextResponse.json({ erro: "Seu perfil não permite enviar documentos." }, { status: 403 });
  }

  const form = await req.formData();
  const arquivo = form.get("arquivo") as File | null;
  const faturaId = String(form.get("fatura_id") ?? "");
  const notaAvulsaId = String(form.get("nota_avulsa_id") ?? "");
  const tipo = String(form.get("tipo") ?? "outro");

  if (!arquivo || (!faturaId && !notaAvulsaId)) {
    return NextResponse.json(
      { erro: "Informe o arquivo e a qual fatura ou nota avulsa ele pertence." },
      { status: 400 }
    );
  }
  if (arquivo.size > 20 * 1024 * 1024) {
    return NextResponse.json({ erro: "Arquivo acima de 20 MB." }, { status: 400 });
  }

  const db = supabaseAdmin();

  /* Anexo de nota avulsa segue caminho próprio: não há competência nem
     contrato por trás, só o serviço pontual. */
  if (notaAvulsaId) {
    const { data: nota } = await db
      .from("notas_avulsas")
      .select("id, fornecedor_id")
      .eq("id", notaAvulsaId)
      .maybeSingle();

    if (!nota) return NextResponse.json({ erro: "Nota avulsa não encontrada." }, { status: 404 });

    const nome = arquivo.name.replace(/[^\w.\-]/g, "_").slice(-120);
    const caminho = `avulsas/${notaAvulsaId}/${Date.now()}-${nome}`;
    const envio = await db.storage
      .from(BUCKET_DOCUMENTOS)
      .upload(caminho, Buffer.from(await arquivo.arrayBuffer()), {
        contentType: arquivo.type || "application/octet-stream",
      });

    if (envio.error) return NextResponse.json({ erro: envio.error.message }, { status: 400 });

    await db.from("documentos").insert({
      nota_avulsa_id: notaAvulsaId,
      fornecedor_id: nota.fornecedor_id,
      tipo,
      confianca: "alta",
      nome_arquivo: arquivo.name,
      storage_path: caminho,
      tamanho_bytes: arquivo.size,
      mime_type: arquivo.type,
      origem: "upload_manual",
      confirmado_em: new Date().toISOString(),
      confirmado_por: sessao?.nome ?? null,
    });

    return NextResponse.json({ ok: true });
  }

  const { data: fatura } = await db
    .from("vw_faturas_detalhe")
    .select("id, fornecedor_id, status")
    .eq("id", faturaId)
    .maybeSingle();

  if (!fatura) return NextResponse.json({ erro: "Fatura não encontrada." }, { status: 404 });

  const nomeSeguro = arquivo.name.replace(/[^\w.\-]/g, "_").slice(-120);
  const path = `${fatura.fornecedor_id}/${faturaId}/${Date.now()}-${nomeSeguro}`;
  const buffer = Buffer.from(await arquivo.arrayBuffer());

  const up = await db.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(path, buffer, { contentType: arquivo.type || "application/octet-stream" });

  if (up.error) return NextResponse.json({ erro: up.error.message }, { status: 400 });

  await db.from("documentos").insert({
    fatura_id: faturaId,
    fornecedor_id: fatura.fornecedor_id,
    tipo,
    confianca: "alta", // enviado por uma pessoa, que escolheu o tipo
    nome_arquivo: arquivo.name,
    storage_path: path,
    tamanho_bytes: arquivo.size,
    mime_type: arquivo.type,
    origem: "upload_manual",
    confirmado_em: new Date().toISOString(),
    confirmado_por: sessao?.nome ?? null,
  });

  // o upload manual também baixa a pendência da fatura
  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = { precisa_revisao: false };
  /* "recibo" e "link_portal" também encerram o lado financeiro da fatura —
     sem isto, um recibo enviado à mão (caso do ChatGPT e do Supabase, cujo
     e-mail o robô não alcança) ficava marcado como recebido mas a fatura
     continuava esperando "o boleto". */
  if (tipo === "nota_fiscal" || tipo === "link_portal") patch.nota_fiscal_recebida_em = agora;
  if (tipo === "fatura" || tipo === "boleto" || tipo === "recibo" || tipo === "link_portal") {
    patch.fatura_recebida_em = agora;
  }
  if (fatura.status === "aguardando_documentos") patch.status = "documentos_recebidos";

  await db.from("faturas").update(patch).eq("id", faturaId);

  return NextResponse.json({ ok: true });
}
