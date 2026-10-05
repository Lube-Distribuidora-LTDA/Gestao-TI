import { supabaseAdmin } from "./supabase";
import { moeda, data as fmtData, competenciaLabel } from "./format";

/**
 * O resumo que o robô manda todo dia, para quem não está na frente do painel.
 *
 * O recorte é a **data de vencimento**, não o status da fatura. Na prática a
 * competência é marcada como "assinado e entregue" assim que o documento vai
 * para a contabilidade — o que encerra a linha no painel, mas não quer dizer
 * que o dinheiro saiu. Um resumo que olhasse só o que está "em aberto" ficaria
 * mudo no dia em que uma conta de R$ 3.707,97 vence.
 *
 * O que exige ação vem primeiro, e a janela é curta de propósito: repetir
 * todo dia uma fatura que venceu há 25 dias não faz ninguém pagá-la, só ensina
 * a ignorar a mensagem. O rabo antigo vira uma linha só, de total.
 */

export type ItemFatura = {
  fornecedor_nome: string;
  competencia: string;
  vencimento: string;
  valor: number;
  /** positivo = já venceu há N dias; negativo = vence em N dias */
  dias: number;
  entregue: boolean;
  falta_nota: boolean;
  falta_fatura: boolean;
};

export type ItemDocumento = {
  fornecedor_nome: string;
  tipo: string;
  quantidade: number;
  numero_nota: string | null;
  competencia: string | null;
};

export type Resumo = {
  data: Date;
  venceHoje: ItemFatura[];
  venceEmBreve: ItemFatura[];
  venceuAgora: ItemFatura[];
  chegaram: ItemDocumento[];
  faltando: ItemFatura[];
  revisar: ItemFatura[];
};

const TIPO_LEGIVEL: Record<string, string> = {
  nota_fiscal: "nota fiscal",
  fatura: "fatura",
  boleto: "boleto",
  recibo: "recibo",
  link_portal: "nota e boleto no portal",
  contrato: "contrato",
  outro: "documento",
};

/** Quantos dias à frente avisar, e quantos dias atrás ainda repetir. */
export const JANELA_FRENTE = 5;
export const JANELA_ATRAS = 3;

type LinhaView = Record<string, unknown>;

export async function montarResumo(horasDeDocumentos = 24): Promise<Resumo> {
  const db = supabaseAdmin();
  const agora = new Date();
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

  /*
   * "paga" e "cancelada" saem: uma já teve baixa, a outra não existe mais.
   * "entregue_contabilidade" FICA — é justamente o estado em que a conta some
   * do painel sem que ninguém tenha confirmado o pagamento.
   */
  const { data: faturas } = await db
    .from("vw_faturas_detalhe")
    .select(
      "fornecedor_nome, competencia, vencimento, valor_efetivo, status, pago_em, pagamento_automatico, nota_fiscal_recebida_em, fatura_recebida_em, exige_nota_fiscal, exige_fatura, precisa_revisao"
    )
    .not("status", "in", "(paga,cancelada)")
    .is("pago_em", null);

  const diasAte = (venc: string): number => {
    const [a, m, d] = venc.split("-").map(Number);
    const alvo = Date.UTC(a, m - 1, d);
    const [ha, hm, hd] = hoje.split("-").map(Number);
    return Math.round((Date.UTC(ha, hm - 1, hd) - alvo) / 86_400_000);
  };

  const comoItem = (f: LinhaView): ItemFatura => ({
    fornecedor_nome: String(f.fornecedor_nome ?? "—"),
    competencia: String(f.competencia ?? ""),
    vencimento: String(f.vencimento ?? ""),
    valor: Number(f.valor_efetivo ?? 0),
    dias: diasAte(String(f.vencimento ?? hoje)),
    entregue: f.status === "entregue_contabilidade",
    falta_nota: Boolean(f.exige_nota_fiscal) && !f.nota_fiscal_recebida_em,
    falta_fatura: Boolean(f.exige_fatura) && !f.fatura_recebida_em,
  });

  /* Débito automático não vence: tem dia de débito, e o cartão cobra sozinho.
     Avisar "vence hoje" nessas contas seria alarme falso todo mês. */
  const candidatas = (faturas ?? []).filter((f) => !f.pagamento_automatico).map(comoItem);

  const venceHoje = candidatas.filter((f) => f.dias === 0);
  const venceEmBreve = candidatas
    .filter((f) => f.dias < 0 && f.dias >= -JANELA_FRENTE)
    .sort((a, b) => b.dias - a.dias);
  const venceuAgora = candidatas
    .filter((f) => f.dias > 0 && f.dias <= JANELA_ATRAS)
    .sort((a, b) => b.dias - a.dias);

  /* Falta documento e ainda há tempo: é o que a cobrança automática persegue.
     Quem já venceu aparece nas seções de data, não duas vezes. */
  const faltando = candidatas.filter((f) => f.dias < -JANELA_FRENTE && (f.falta_nota || f.falta_fatura));
  const revisar = (faturas ?? []).filter((f) => f.precisa_revisao).map(comoItem);

  const limite = new Date(agora.getTime() - horasDeDocumentos * 3_600_000).toISOString();
  const { data: documentos } = await db
    .from("documentos")
    .select("tipo, fornecedor_id, criado_em, fornecedores(nome), faturas(competencia, numero_nota)")
    .gte("criado_em", limite)
    .order("criado_em", { ascending: true });

  /* A SAAM manda dois links no mesmo dia (SISAUDCON e NB Technology) e os dois
     documentos têm o mesmo nome. Listados crus, viram duas linhas idênticas e
     parecem erro: agrupar e contar diz a verdade em menos espaço. */
  const agrupados = new Map<string, ItemDocumento>();
  for (const d of documentos ?? []) {
    const forn = d.fornecedores as { nome?: string } | null;
    const fat = d.faturas as { competencia?: string; numero_nota?: string } | null;
    const nome = forn?.nome ?? "—";
    const tipo = TIPO_LEGIVEL[String(d.tipo)] ?? String(d.tipo);
    const chave = `${nome}|${tipo}|${fat?.competencia ?? ""}`;
    const existente = agrupados.get(chave);
    if (existente) {
      existente.quantidade++;
      continue;
    }
    agrupados.set(chave, {
      fornecedor_nome: nome,
      tipo,
      quantidade: 1,
      numero_nota: fat?.numero_nota ?? null,
      competencia: fat?.competencia ?? null,
    });
  }

  return {
    data: agora,
    venceHoje,
    venceEmBreve,
    venceuAgora,
    chegaram: [...agrupados.values()],
    faltando,
    revisar,
  };
}

/** Escapa o que o Telegram leria como marcação HTML. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Nome comprido de fornecedor não cabe no celular. */
function curto(nome: string, max = 28): string {
  const n = nome.trim();
  return n.length <= max ? n : `${n.slice(0, max - 1).trimEnd()}…`;
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/*
 * O estado do documento entra nos **dois** sentidos, e é isso que o torna
 * informação: na Lube todo documento acaba assinado pelo Sergio e entregue à
 * contabilidade, então ver só o "entregue" seria a mesma palavra em toda
 * linha. O que vale a leitura é a competência que ainda **não** passou por
 * esse caminho — essa é a que espera uma ação.
 */
function linhaFatura(f: ItemFatura, quando: string): string {
  const estado = f.entregue ? "entregue à contabilidade" : "<b>ainda não entregue</b>";
  return `• <b>${esc(curto(f.fornecedor_nome))}</b> — ${moeda(f.valor)}\n   ${fmtData(f.vencimento)} · ${quando} · ${estado}`;
}

/**
 * Formata em HTML do Telegram (b, i, a).
 *
 * Devolve `null` quando não há nada a dizer, e aí o robô não manda mensagem
 * nenhuma. Silêncio é informação: quer dizer que não há conta chegando, e
 * vale mais que um "sem novidades" diário que ninguém abre.
 */
export function formatarResumoTelegram(r: Resumo, urlPainel?: string): string | null {
  const temAlgo =
    r.venceHoje.length || r.venceEmBreve.length || r.venceuAgora.length ||
    r.chegaram.length || r.faltando.length || r.revisar.length;
  if (!temAlgo) return null;

  const dataCurta = `${String(r.data.getDate()).padStart(2, "0")}/${String(r.data.getMonth() + 1).padStart(2, "0")}`;
  const l: string[] = [`<b>Gestão de TI</b> · ${DIAS[r.data.getDay()]}, ${dataCurta}`];

  if (r.venceHoje.length) {
    const total = r.venceHoje.reduce((s, f) => s + f.valor, 0);
    l.push("", `🔴 <b>Vence hoje</b> — ${moeda(total)}`);
    r.venceHoje.forEach((f) => l.push(linhaFatura(f, "é hoje")));
  }

  if (r.venceuAgora.length) {
    l.push("", `🔴 <b>Venceu</b>`);
    r.venceuAgora.forEach((f) =>
      l.push(linhaFatura(f, f.dias === 1 ? "venceu ontem" : `venceu há ${f.dias} dias`))
    );
  }

  if (r.venceEmBreve.length) {
    const total = r.venceEmBreve.reduce((s, f) => s + f.valor, 0);
    l.push("", `🟡 <b>Vence em até ${JANELA_FRENTE} dias</b> — ${moeda(total)}`);
    r.venceEmBreve.forEach((f) => {
      const d = Math.abs(f.dias);
      l.push(linhaFatura(f, d === 1 ? "amanhã" : `em ${d} dias`));
    });
  }

  if (r.chegaram.length) {
    l.push("", `✅ <b>Chegou no painel</b>`);
    for (const d of r.chegaram.slice(0, 10)) {
      const qtd = d.quantidade > 1 ? ` (${d.quantidade})` : "";
      const nota = d.numero_nota ? ` nº ${esc(d.numero_nota)}` : "";
      const comp = d.competencia ? ` · ${competenciaLabel(d.competencia)}` : "";
      l.push(`• <b>${esc(curto(d.fornecedor_nome))}</b> — ${esc(d.tipo)}${qtd}${nota}${comp}`);
    }
    if (r.chegaram.length > 10) l.push(`   <i>e mais ${r.chegaram.length - 10}</i>`);
  }

  if (r.revisar.length) {
    l.push("", `⚠️ <b>Precisa de conferência</b> (${r.revisar.length})`);
    r.revisar.slice(0, 5).forEach((f) =>
      l.push(`• ${esc(curto(f.fornecedor_nome))} · ${competenciaLabel(f.competencia)}`)
    );
  }

  if (r.faltando.length) {
    l.push("", `📨 <b>Ainda devem documento</b> (${r.faltando.length})`);
    r.faltando.slice(0, 6).forEach((f) => {
      const o = f.falta_nota && f.falta_fatura ? "nota e boleto" : f.falta_nota ? "nota" : "boleto";
      l.push(`• ${esc(curto(f.fornecedor_nome))} — falta ${o} · ${competenciaLabel(f.competencia)}`);
    });
    if (r.faltando.length > 6) l.push(`   <i>e mais ${r.faltando.length - 6}</i>`);
  }

  if (urlPainel) l.push("", `<a href="${urlPainel}">Abrir o painel</a>`);

  return l.join("\n");
}
