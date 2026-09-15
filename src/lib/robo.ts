import { supabaseAdmin, BUCKET_DOCUMENTOS } from "./supabase";
import {
  lerEmailsRecentes,
  classificarAnexo,
  extrairCompetencia,
  extrairNumeroNota,
  imapConfigurado,
  type EmailLido,
} from "./imap";
import { enviarEmail } from "./mailer";
import { emailCobranca } from "./templates";
import { hojeISO } from "./format";

/* ============================================================
   1. LEITURA DO WEBMAIL E VÍNCULO AUTOMÁTICO DE DOCUMENTOS
   ============================================================ */

type Fornecedor = {
  id: string;
  nome: string;
  emails_remetentes: string[];
  email_cobranca: string | null;
};

type ContaLite = {
  id: string;
  fornecedor_id: string;
  descricao: string;
  identificador: string | null;
  palavras_chave: string[];
  exige_nota_fiscal: boolean;
  exige_fatura: boolean;
};

export type ResultadoLeitura = {
  sucesso: boolean;
  emailsLidos: number;      // total de e-mails na janela varrida
  candidatos: number;       // passaram no filtro de remetente + anexo
  baixados: number;         // tiveram o corpo baixado
  documentosVinculados: number;
  faturasAtualizadas: number;
  semCorrespondencia: number;
  jaProcessados: number;
  detalhes: Array<{ assunto: string; remetente: string; resultado: string }>;
  erro?: string;
};

/** Casa o remetente do e-mail com um fornecedor cadastrado. */
function acharFornecedor(remetente: string, fornecedores: Fornecedor[]): Fornecedor | null {
  if (!remetente) return null;
  const email = remetente.toLowerCase().trim();
  const dominio = email.split("@")[1] ?? "";

  // 1) endereço exato cadastrado em emails_remetentes
  const exato = fornecedores.find((f) =>
    (f.emails_remetentes ?? []).some((e) => e.toLowerCase().trim() === email)
  );
  if (exato) return exato;

  // 2) domínio cadastrado como "@dominio.com.br" em emails_remetentes
  const porDominioCadastrado = fornecedores.find((f) =>
    (f.emails_remetentes ?? []).some((e) => {
      const t = e.toLowerCase().trim();
      return t.startsWith("@") && dominio === t.slice(1);
    })
  );
  if (porDominioCadastrado) return porDominioCadastrado;

  // 3) mesmo domínio do e-mail de cobrança do fornecedor
  if (dominio) {
    const porCobranca = fornecedores.find(
      (f) => (f.email_cobranca ?? "").toLowerCase().split("@")[1] === dominio
    );
    if (porCobranca) return porCobranca;
  }

  return null;
}

/** Entre as contas de um fornecedor, descobre a que o e-mail se refere. */
function acharConta(email: EmailLido, contas: ContaLite[]): ContaLite | null {
  if (contas.length === 0) return null;
  if (contas.length === 1) return contas[0];

  const ctx = [
    email.assunto,
    email.textoCorpo.slice(0, 1500),
    ...email.anexos.map((a) => a.nome),
  ]
    .join(" ")
    .toLowerCase();

  // pontua cada conta por palavras-chave e identificador encontrados
  let melhor: ContaLite | null = null;
  let melhorPonto = 0;

  for (const c of contas) {
    let pontos = 0;
    for (const p of c.palavras_chave ?? []) {
      const termo = p.toLowerCase().trim();
      if (termo.length >= 3 && ctx.includes(termo)) pontos += 2;
    }
    if (c.identificador && c.identificador.length >= 4) {
      if (ctx.includes(c.identificador.toLowerCase())) pontos += 4;
    }
    if (pontos > melhorPonto) {
      melhorPonto = pontos;
      melhor = c;
    }
  }

  return melhorPonto > 0 ? melhor : null;
}

export async function processarEmails(opts?: { dias?: number }): Promise<ResultadoLeitura> {
  const db = supabaseAdmin();
  const detalhes: ResultadoLeitura["detalhes"] = [];

  const base: ResultadoLeitura = {
    sucesso: false,
    emailsLidos: 0,
    candidatos: 0,
    baixados: 0,
    documentosVinculados: 0,
    faturasAtualizadas: 0,
    semCorrespondencia: 0,
    jaProcessados: 0,
    detalhes,
  };

  if (!imapConfigurado()) {
    return { ...base, erro: "IMAP não configurado (IMAP_HOST / IMAP_USER / IMAP_PASS)." };
  }

  const execucao = await db
    .from("robo_execucoes")
    .insert({ tipo: "leitura_email" })
    .select("id")
    .single();
  const execId = execucao.data?.id as string | undefined;

  try {
    const [{ data: cfgRows }, { data: fornecedoresData }, { data: contasData }] = await Promise.all([
      db.from("configuracoes").select("chave, valor"),
      db.from("fornecedores").select("id, nome, emails_remetentes, email_cobranca").eq("ativo", true),
      db
        .from("contas")
        .select("id, fornecedor_id, descricao, identificador, palavras_chave, exige_nota_fiscal, exige_fatura")
        .eq("ativo", true),
    ]);

    const cfg = new Map((cfgRows ?? []).map((c) => [c.chave as string, c.valor as string]));
    if (cfg.get("leitura_email_ativa") === "false") {
      return { ...base, sucesso: true, erro: "Leitura automática desligada nas configurações." };
    }

    const fornecedores = (fornecedoresData ?? []) as Fornecedor[];
    const contas = (contasData ?? []) as ContaLite[];

    const dias = opts?.dias ?? Number(cfg.get("imap_dias_retroativos") ?? 7);

    // a triagem acontece no servidor de e-mail: só baixamos o corpo de quem
    // veio de um fornecedor cadastrado e trouxe anexo
    const remetentesConhecidos = fornecedores.flatMap((f) => [
      ...(f.emails_remetentes ?? []),
      ...(f.email_cobranca ? ["@" + (f.email_cobranca.split("@")[1] ?? "")] : []),
    ]);

    const varredura = await lerEmailsRecentes({
      dias,
      pasta: cfg.get("imap_pasta") || "INBOX",
      remetentesConhecidos,
    });

    const emails = varredura.emails;
    base.emailsLidos = varredura.totalNoPeriodo;
    base.candidatos = varredura.candidatos;
    base.baixados = varredura.baixados;

    for (const email of emails) {
      // --- idempotência: nunca processa o mesmo e-mail duas vezes ---
      const { data: jaVisto } = await db
        .from("emails_processados")
        .select("id")
        .eq("message_id", email.messageId)
        .maybeSingle();

      if (jaVisto) {
        base.jaProcessados++;
        continue;
      }

      const registro = {
        message_id: email.messageId,
        uid: email.uid,
        remetente: email.remetente,
        assunto: email.assunto.slice(0, 500),
        recebido_em: email.data.toISOString(),
        fornecedor_id: null as string | null,
        fatura_id: null as string | null,
        anexos_salvos: 0,
        resultado: "sem_correspondencia",
      };

      const fornecedor = acharFornecedor(email.remetente, fornecedores);

      if (!fornecedor) {
        base.semCorrespondencia++;
        await db.from("emails_processados").insert(registro);
        continue;
      }
      registro.fornecedor_id = fornecedor.id;

      if (email.anexos.length === 0) {
        registro.resultado = "ignorado_sem_anexo";
        await db.from("emails_processados").insert(registro);
        detalhes.push({
          assunto: email.assunto,
          remetente: email.remetente,
          resultado: `${fornecedor.nome}: e-mail sem anexo`,
        });
        continue;
      }

      // --- qual conta/contrato? ---
      const contasDoFornecedor = contas.filter((c) => c.fornecedor_id === fornecedor.id);
      const conta = acharConta(email, contasDoFornecedor);

      if (!conta) {
        registro.resultado =
          contasDoFornecedor.length === 0
            ? "fornecedor_sem_conta"
            : "conta_indefinida";
        await db.from("emails_processados").insert(registro);
        detalhes.push({
          assunto: email.assunto,
          remetente: email.remetente,
          resultado:
            contasDoFornecedor.length === 0
              ? `${fornecedor.nome}: nenhuma conta cadastrada`
              : `${fornecedor.nome}: não deu para saber a qual contrato se refere`,
        });
        continue;
      }

      // --- qual competência/fatura? ---
      const compCitada = extrairCompetencia(`${email.assunto} ${email.textoCorpo.slice(0, 800)}`);

      let fatura: { id: string; competencia: string; numero_nota: string | null } | null = null;

      if (compCitada) {
        const { data } = await db
          .from("faturas")
          .select("id, competencia, numero_nota")
          .eq("conta_id", conta.id)
          .eq("competencia", compCitada)
          .maybeSingle();
        fatura = data;
      }

      // sem competência explícita: pega a pendente mais antiga da conta
      if (!fatura) {
        const { data } = await db
          .from("faturas")
          .select("id, competencia, numero_nota")
          .eq("conta_id", conta.id)
          .in("status", ["aguardando_documentos", "documentos_recebidos"])
          .order("competencia", { ascending: true })
          .limit(1);
        fatura = data?.[0] ?? null;
      }

      if (!fatura) {
        registro.resultado = "sem_fatura_aberta";
        await db.from("emails_processados").insert(registro);
        detalhes.push({
          assunto: email.assunto,
          remetente: email.remetente,
          resultado: `${fornecedor.nome} / ${conta.descricao}: nenhuma competência em aberto`,
        });
        continue;
      }

      // --- salva os anexos e classifica ---
      let temNota = false;
      let temFatura = false;
      let temDuvida = false;
      let numeroNota: string | null = null;
      let salvos = 0;

      for (const anexo of email.anexos) {
        const cls = classificarAnexo(anexo.nome, email.assunto);
        const nomeSeguro = anexo.nome.replace(/[^\w.\-]/g, "_").slice(-120);
        const path = `${fornecedor.id}/${fatura.id}/${Date.now()}-${nomeSeguro}`;

        const up = await db.storage
          .from(BUCKET_DOCUMENTOS)
          .upload(path, anexo.conteudo, { contentType: anexo.mime, upsert: false });

        await db.from("documentos").insert({
          fatura_id: fatura.id,
          fornecedor_id: fornecedor.id,
          tipo: cls.tipo,
          confianca: cls.confianca,
          nome_arquivo: anexo.nome,
          storage_path: up.error ? null : path,
          tamanho_bytes: anexo.tamanho,
          mime_type: anexo.mime,
          origem: "email",
          email_message_id: email.messageId,
          email_assunto: email.assunto.slice(0, 500),
          email_remetente: email.remetente,
          recebido_em: email.data.toISOString(),
        });

        salvos++;

        if (cls.tipo === "nota_fiscal") {
          temNota = true;
          numeroNota ??= extrairNumeroNota(`${anexo.nome} ${email.assunto}`);
        } else if (cls.tipo === "fatura" || cls.tipo === "boleto") {
          temFatura = true;
        } else if (cls.confianca === "baixa") {
          temDuvida = true;
        }
      }

      // --- atualiza a fatura ---
      const agora = new Date().toISOString();
      const patch: Record<string, unknown> = {};

      if (temNota) {
        patch.nota_fiscal_recebida_em = agora;
        if (numeroNota) patch.numero_nota = numeroNota;
      }
      if (temFatura) patch.fatura_recebida_em = agora;

      // Documento chegou mas não deu para classificar: para de cobrar e pede conferência.
      if (!temNota && !temFatura && temDuvida) patch.precisa_revisao = true;

      const { data: atual } = await db
        .from("faturas")
        .select("nota_fiscal_recebida_em, fatura_recebida_em, status")
        .eq("id", fatura.id)
        .single();

      const nfOk = !conta.exige_nota_fiscal || temNota || !!atual?.nota_fiscal_recebida_em;
      const fatOk = !conta.exige_fatura || temFatura || !!atual?.fatura_recebida_em;

      if (atual?.status === "aguardando_documentos") {
        // qualquer documento válido já tira a competência da fila de cobrança
        patch.status = "documentos_recebidos";
      }
      if (nfOk && fatOk && atual?.status !== "paga") {
        patch.status = "documentos_recebidos";
      }

      await db.from("faturas").update(patch).eq("id", fatura.id);

      registro.fatura_id = fatura.id;
      registro.anexos_salvos = salvos;
      registro.resultado = "vinculado";
      await db.from("emails_processados").insert(registro);

      base.documentosVinculados += salvos;
      base.faturasAtualizadas++;

      detalhes.push({
        assunto: email.assunto,
        remetente: email.remetente,
        resultado: `✓ ${fornecedor.nome} / ${conta.descricao} — ${salvos} documento(s)${
          temDuvida ? " (classificação a confirmar)" : ""
        }`,
      });
    }

    base.sucesso = true;

    if (execId) {
      await db
        .from("robo_execucoes")
        .update({
          finalizado_em: new Date().toISOString(),
          sucesso: true,
          emails_lidos: base.emailsLidos,
          documentos_vinculados: base.documentosVinculados,
          detalhes: {
            candidatos: base.candidatos,
            baixados: base.baixados,
            faturasAtualizadas: base.faturasAtualizadas,
            semCorrespondencia: base.semCorrespondencia,
            jaProcessados: base.jaProcessados,
            itens: detalhes.slice(0, 60),
          },
        })
        .eq("id", execId);
    }

    return base;
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    if (execId) {
      await db
        .from("robo_execucoes")
        .update({ finalizado_em: new Date().toISOString(), sucesso: false, erro })
        .eq("id", execId);
    }
    return { ...base, erro };
  }
}

/* ============================================================
   2. COBRANÇA AUTOMÁTICA DE NOTAS E FATURAS
   ============================================================ */

export type ResultadoCobranca = {
  sucesso: boolean;
  analisadas: number;
  enviadas: number;
  falhas: number;
  ignoradas: number;
  detalhes: Array<{ fornecedor: string; conta: string; resultado: string; ok: boolean }>;
  erro?: string;
};

export async function executarCobrancas(opts?: {
  forcarFaturaId?: string;
}): Promise<ResultadoCobranca> {
  const db = supabaseAdmin();
  const detalhes: ResultadoCobranca["detalhes"] = [];
  const base: ResultadoCobranca = {
    sucesso: false,
    analisadas: 0,
    enviadas: 0,
    falhas: 0,
    ignoradas: 0,
    detalhes,
  };

  const execucao = await db
    .from("robo_execucoes")
    .insert({ tipo: "cobranca" })
    .select("id")
    .single();
  const execId = execucao.data?.id as string | undefined;

  try {
    const { data: cfgRows } = await db.from("configuracoes").select("chave, valor");
    const cfg = new Map((cfgRows ?? []).map((c) => [c.chave as string, c.valor as string]));

    const manual = !!opts?.forcarFaturaId;

    if (!manual && cfg.get("cobranca_ativa_global") === "false") {
      return { ...base, sucesso: true, erro: "Cobrança automática desligada nas configurações." };
    }

    const emailTI = cfg.get("ti_email_remetente") ?? process.env.SMTP_USER ?? "cpd@lube.com.br";

    let query = db
      .from("vw_faturas_detalhe")
      .select("*")
      .not("status", "in", "(paga,cancelada)");

    if (opts?.forcarFaturaId) {
      query = query.eq("id", opts.forcarFaturaId);
    } else {
      query = query.eq("status", "aguardando_documentos").eq("cobranca_ativa", true);
    }

    const { data: faturas, error } = await query;
    if (error) throw new Error(error.message);

    const hoje = hojeISO();

    for (const f of faturas ?? []) {
      base.analisadas++;

      const faltantes: string[] = [];
      if (f.exige_nota_fiscal && !f.nota_fiscal_recebida_em) faltantes.push("nota fiscal");
      if (f.exige_fatura && !f.fatura_recebida_em) faltantes.push("fatura/boleto");

      const pular = (motivo: string) => {
        base.ignoradas++;
        detalhes.push({
          fornecedor: f.fornecedor_nome,
          conta: f.conta_descricao,
          resultado: motivo,
          ok: false,
        });
      };

      if (faltantes.length === 0) {
        pular("documentos já recebidos");
        continue;
      }
      if (!f.email_cobranca) {
        pular("fornecedor sem e-mail de cobrança cadastrado");
        continue;
      }

      if (!manual) {
        if (f.precisa_revisao) {
          pular("documento recebido aguardando conferência");
          continue;
        }
        if (f.cobrancas_enviadas >= f.max_cobrancas) {
          pular(`limite de ${f.max_cobrancas} cobranças atingido`);
          continue;
        }

        // só começa a cobrar a N dias do vencimento
        const inicio = new Date(f.vencimento + "T00:00:00");
        inicio.setDate(inicio.getDate() - (f.dias_antes_vencimento ?? 5));
        if (hoje < inicio.toISOString().slice(0, 10)) {
          pular("ainda fora da janela de cobrança");
          continue;
        }

        // respeita o intervalo entre cobranças
        if (f.ultima_cobranca_em) {
          const proxima = new Date(f.ultima_cobranca_em);
          proxima.setDate(proxima.getDate() + (f.intervalo_cobranca_dias ?? 3));
          if (Date.now() < proxima.getTime()) {
            pular("aguardando intervalo desde a última cobrança");
            continue;
          }
        }
      }

      const tentativa = (f.cobrancas_enviadas ?? 0) + 1;
      const { assunto, html } = emailCobranca({
        fornecedorNome: f.fornecedor_nome,
        contaDescricao: f.conta_descricao,
        identificador: f.identificador,
        competencia: f.competencia,
        vencimento: f.vencimento,
        valorPrevisto: Number(f.valor_previsto ?? 0),
        faltantes,
        tentativa,
        emailTI,
      });

      const { data: registro } = await db
        .from("cobrancas")
        .insert({
          fatura_id: f.id,
          tentativa,
          destinatario: f.email_cobranca,
          assunto,
          corpo: html,
          status: "pendente",
          automatica: !manual,
        })
        .select("id")
        .single();

      const envio = await enviarEmail({
        para: f.email_cobranca,
        assunto,
        html,
        responderPara: emailTI,
      });

      if (envio.ok) {
        const agora = new Date().toISOString();
        await db
          .from("cobrancas")
          .update({ status: "enviada", enviada_em: agora })
          .eq("id", registro?.id);
        await db
          .from("faturas")
          .update({ cobrancas_enviadas: tentativa, ultima_cobranca_em: agora })
          .eq("id", f.id);

        base.enviadas++;
        detalhes.push({
          fornecedor: f.fornecedor_nome,
          conta: f.conta_descricao,
          resultado: `cobrança ${tentativa}ª enviada para ${f.email_cobranca}`,
          ok: true,
        });
      } else {
        await db
          .from("cobrancas")
          .update({ status: "erro", erro: envio.erro })
          .eq("id", registro?.id);
        base.falhas++;
        detalhes.push({
          fornecedor: f.fornecedor_nome,
          conta: f.conta_descricao,
          resultado: `falha no envio: ${envio.erro}`,
          ok: false,
        });
      }
    }

    base.sucesso = true;

    if (execId) {
      await db
        .from("robo_execucoes")
        .update({
          finalizado_em: new Date().toISOString(),
          sucesso: true,
          cobrancas_enviadas: base.enviadas,
          detalhes: {
            analisadas: base.analisadas,
            falhas: base.falhas,
            ignoradas: base.ignoradas,
            itens: detalhes.slice(0, 60),
          },
        })
        .eq("id", execId);
    }

    return base;
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    if (execId) {
      await db
        .from("robo_execucoes")
        .update({ finalizado_em: new Date().toISOString(), sucesso: false, erro })
        .eq("id", execId);
    }
    return { ...base, erro };
  }
}
