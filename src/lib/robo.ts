import { supabaseAdmin, BUCKET_DOCUMENTOS } from "./supabase";
import {
  lerEmailsRecentes,
  classificarAnexo,
  extrairCompetencia,
  extrairVencimento,
  extrairNumeroNota,
  imapConfigurado,
  type EmailLido,
} from "./imap";
import { extrairDados, consolidar, type DadosDocumento } from "./extrair-documento";
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
  dia_vencimento: number | null;
  valor_previsto: number | null;
};

export type ResultadoLeitura = {
  sucesso: boolean;
  emailsLidos: number;      // total de e-mails na janela varrida
  candidatos: number;       // passaram no filtro de remetente + anexo
  baixados: number;         // tiveram o corpo baixado
  cortados: number;         // candidatos que o limite deixou para a próxima rodada
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

/**
 * Entre as contas de um fornecedor, descobre a que o e-mail se refere.
 *
 * Cada conta é pontuada pelas palavras-chave encontradas no assunto, no corpo
 * e no nome dos anexos. Duas regras evitam os enganos mais comuns:
 *
 * - termo iniciado por "!" é **negativo**: se aparecer, a conta é descartada.
 *   É o que separa "LUBE RJ | FIREWALL" de "LUBE | FIREWALL", já que a
 *   palavra "firewall" está nos dois;
 * - termos mais longos valem mais, porque são mais específicos.
 */
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

  let melhor: ContaLite | null = null;
  let melhorPonto = 0;

  for (const c of contas) {
    let pontos = 0;
    let desqualificada = false;

    for (const p of c.palavras_chave ?? []) {
      const bruto = p.toLowerCase().trim();
      if (!bruto) continue;

      if (bruto.startsWith("!")) {
        const proibido = bruto.slice(1).trim();
        if (proibido.length >= 3 && ctx.includes(proibido)) {
          desqualificada = true;
          break;
        }
        continue;
      }

      // termos curtos demais casam com pedaços de outras palavras
      if (bruto.length >= 4 && ctx.includes(bruto)) pontos += bruto.length;
    }

    if (desqualificada) continue;

    // o identificador do contrato é a pista mais forte que existe
    if (c.identificador && c.identificador.length >= 4 && ctx.includes(c.identificador.toLowerCase())) {
      pontos += 30;
    }

    if (pontos > melhorPonto) {
      melhorPonto = pontos;
      melhor = c;
    }
  }

  return melhorPonto > 0 ? melhor : null;
}

/**
 * Separa o que é documento de cobrança do que é só conversa do dia a dia.
 *
 * O fornecedor manda pelo mesmo endereço a nota fiscal, o relatório mensal, a
 * proposta comercial e o print do chamado. Sem este filtro, a captura de tela
 * de um chamado de firewall entrava como documento da fatura e o relatório
 * mensal virava anexo de cobrança.
 */
function pareceDocumentoFiscal(assunto: string, nomesAnexos: string[]): boolean {
  const ctx = `${assunto} ${nomesAnexos.join(" ")}`.toLowerCase();

  // assunto de atendimento ou material comercial: não é cobrança
  if (/(chamado|ticket|#\d{4,}|relat[óo]rio|proposta|or[çc]amento|reuni[ãa]o|ata de|aditivo|contrato de presta)/i.test(ctx)) {
    return false;
  }

  return /(nfse|nfs-e|nf-e|nfe|nota[\s_-]?fiscal|danfe|boleto|fatura|invoice|cobran[çc]a|t[íi]tulo|nf|vencim)/i.test(ctx);
}

export async function processarEmails(opts?: { dias?: number }): Promise<ResultadoLeitura> {
  const db = supabaseAdmin();
  const detalhes: ResultadoLeitura["detalhes"] = [];

  const base: ResultadoLeitura = {
    sucesso: false,
    emailsLidos: 0,
    candidatos: 0,
    baixados: 0,
    cortados: 0,
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
        .select("id, fornecedor_id, descricao, identificador, palavras_chave, exige_nota_fiscal, exige_fatura, dia_vencimento, valor_previsto")
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

    /*
     * Os message-ids já processados vão junto para a triagem. Antes a conferência
     * só acontecia depois do download, então a cota de mensagens era gasta relendo
     * documentos antigos e as notas ainda desconhecidas ficavam de fora do corte.
     */
    const { data: processados } = await db
      .from("emails_processados")
      .select("message_id")
      .gte("recebido_em", new Date(Date.now() - dias * 86_400_000).toISOString());

    const varredura = await lerEmailsRecentes({
      dias,
      pasta: cfg.get("imap_pasta") || "INBOX",
      remetentesConhecidos,
      jaProcessados: new Set((processados ?? []).map((p) => p.message_id as string)),
    });

    const emails = varredura.emails;
    base.emailsLidos = varredura.totalNoPeriodo;
    base.candidatos = varredura.candidatos;
    base.baixados = varredura.baixados;
    base.cortados = varredura.cortados;

    /* Nenhum documento pode sumir em silêncio: se o limite cortou alguém, isso
       vira uma linha no relatório da execução, visível na tela do robô. */
    if (varredura.cortados > 0) {
      detalhes.push({
        assunto: `${varredura.cortados} e-mail(s) com anexo ficaram sem ler`,
        remetente: "(limite da varredura)",
        resultado:
          "O limite por execução foi atingido. Rode a leitura de novo para alcançar os mais antigos.",
      });
    }

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

      if (!pareceDocumentoFiscal(email.assunto, email.anexos.map((a) => a.nome))) {
        registro.resultado = "ignorado_nao_fiscal";
        await db.from("emails_processados").insert(registro);
        detalhes.push({
          assunto: email.assunto,
          remetente: email.remetente,
          resultado: `${fornecedor.nome}: anexo não é documento de cobrança`,
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

      /* --- qual competência/fatura? ---
       *
       * O texto do e-mail manda. "NOTA FISCAL | LUBE | JULHO | FIREWALL ...
       * Vencimento 15/08" diz o mês de referência e a data de pagamento com
       * todas as letras — e é isso que o financeiro cobra.
       *
       * Quando a competência é identificada mas ainda não existe no banco, ela
       * é criada. Antes o documento caía na competência aberta mais antiga:
       * notas de julho e agosto foram parar todas em setembro, com vencimento
       * errado, e uma conta venceu sem ninguém ver.
       */
      /*
       * Os anexos são lidos antes de qualquer decisão. O que está escrito no
       * documento — número da nota, valor, vencimento, competência — vale mais
       * que qualquer pista do assunto ou do nome do arquivo, que foi o que
       * levou notas para o mês errado e mostrou vencimento trocado no painel.
       */
      const lidos: Array<{ tipo: string; dados: DadosDocumento }> = [];
      for (const anexo of email.anexos) {
        const cls = classificarAnexo(anexo.nome, email.assunto);
        lidos.push({ tipo: cls.tipo, dados: await extrairDados(anexo.nome, anexo.conteudo) });
      }
      const doc = consolidar(lidos);

      const contexto = `${email.assunto} ${email.textoCorpo.slice(0, 800)}`;
      const vencCitado = doc.vencimento ?? extrairVencimento(contexto, email.data);

      /*
       * A competência sai da melhor pista disponível, nesta ordem:
       *   1. o mês escrito no e-mail ("| JULHO |", "Competência 08/2026");
       *   2. o mês do vencimento anunciado — é o mês em que a conta pesa no
       *      caixa, que é o que o financeiro acompanha;
       *   3. o mês em que a mensagem chegou.
       *
       * Sempre há uma resposta: antes, quando nenhuma competência existia no
       * banco, o documento ficava sem lugar e a nota sumia do painel.
       */
      const compCitada =
        doc.competencia ??
        extrairCompetencia(contexto, email.data) ??
        (vencCitado ? `${vencCitado.slice(0, 7)}-01` : null) ??
        `${email.data.getFullYear()}-${String(email.data.getMonth() + 1).padStart(2, "0")}-01`;

      let fatura: { id: string; competencia: string; numero_nota: string | null } | null = null;

      if (compCitada) {
        const { data } = await db
          .from("faturas")
          .select("id, competencia, numero_nota")
          .eq("conta_id", conta.id)
          .eq("competencia", compCitada)
          .maybeSingle();
        fatura = data;

        // competência conhecida que ainda não existe: abre agora, no mês certo
        if (!fatura) {
          const vencimento =
            vencCitado ??
            (() => {
              const [a, m] = compCitada.split("-").map(Number);
              const dia = conta.dia_vencimento ?? 10;
              const ultimo = new Date(a, m, 0).getDate();
              // a nota costuma vencer no mês seguinte ao de referência
              const prox = new Date(a, m, Math.min(dia, ultimo));
              return prox.toISOString().slice(0, 10);
            })();

          const { data: nova } = await db
            .from("faturas")
            .insert({
              conta_id: conta.id,
              competencia: compCitada,
              vencimento,
              valor_previsto: conta.valor_previsto ?? 0,
              observacoes: "Competência aberta pelo robô ao receber o documento.",
            })
            .select("id, competencia, numero_nota")
            .single();
          fatura = nova;
        }
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
          // o número lido dentro da nota vence o que o nome do arquivo sugere
          numeroNota ??= doc.numeroNota ?? extrairNumeroNota(`${anexo.nome} ${email.assunto}`);
        } else if (cls.tipo === "fatura" || cls.tipo === "boleto") {
          temFatura = true;
        } else if (cls.confianca === "baixa") {
          temDuvida = true;
        }
      }

      // --- atualiza a fatura ---
      const agora = new Date().toISOString();
      const patch: Record<string, unknown> = {};

      // o fornecedor anunciou a data de pagamento: ela vale mais que o dia
      // fixo do contrato, desde que a competência ainda não esteja quitada
      if (vencCitado) patch.vencimento = vencCitado;

      if (temNota) {
        patch.nota_fiscal_recebida_em = agora;
        if (numeroNota) patch.numero_nota = numeroNota;
      }

      /*
       * Valor: o líquido é o que sai do caixa, então é ele que fica no campo
       * principal. Quando a nota tem retenção, o bruto é registrado ao lado
       * para a conferência bater com o papel.
       */
      const valorDoDocumento = doc.valorLiquido ?? doc.valorTotal;
      if (valorDoDocumento) {
        patch.valor_real = valorDoDocumento;
        if (doc.valorTotal && doc.valorLiquido && doc.valorTotal !== doc.valorLiquido) {
          patch.valor_bruto = doc.valorTotal;
        }
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
      if (nfOk && fatOk && atual?.status !== "paga" && atual?.status !== "entregue_contabilidade") {
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
            cortados: base.cortados,
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
