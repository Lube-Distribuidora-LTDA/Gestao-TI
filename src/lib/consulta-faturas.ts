import { supabaseAdmin } from "@/lib/supabase";

/**
 * A consulta de faturas com todos os filtros da tela. Fica fora da rota porque a lista
 * (/api/faturas) e o Excel (/api/faturas/exportar) precisam do mesmo recorte: exportar
 * com outra regra daria um arquivo diferente do que está sendo olhado.
 *
 * Fornecedor, categoria, situação e competência aceitam vários valores separados por
 * vírgula (filtro de escolha múltipla; vazio = todos).
 */
export async function consultarFaturas(p: URLSearchParams) {
  const db = supabaseAdmin();
  let q = db.from("vw_faturas_detalhe").select("*");

  /*
   * Fornecedor inativo sai da lista. Marcar como inativo é como se encerra um
   * contrato aqui, e a competência dele não deveria mais ocupar a tela — a
   * Data R Informática estava inativa e continuava aparecendo em outubro.
   *
   * `inativos=1` traz de volta, para quem precisar consultar o histórico de um
   * fornecedor encerrado sem ter que reativá-lo só para olhar.
   */
  if (p.get("inativos") !== "1") {
    q = q.eq("fornecedor_ativo", true);
  }

  const lista = (k: string) =>
    (p.get(k) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const competencias = lista("competencia");
  const status = lista("status");
  const fornecedores = lista("fornecedor");
  const categorias = lista("categoria");
  const filtro = p.get("filtro");
  const busca = p.get("busca");

  if (competencias.length) q = q.in("competencia", competencias);
  if (status.length) q = q.in("status", status);
  if (fornecedores.length) q = q.in("fornecedor_id", fornecedores);
  if (categorias.length) q = q.in("categoria_id", categorias);
  if (filtro === "vencidas") q = q.eq("vencida", true);
  if (filtro === "revisao") q = q.eq("precisa_revisao", true);
  if (filtro === "aguardando") q = q.eq("status", "aguardando_documentos");

  /*
   * Recorte de vencimento. `de`/`ate` vêm do período escolhido na faixa de filtros
   * (atalho ou datas livres); `mesVencimento` ("2026-09") é o formato antigo, que
   * links salvos ainda podem trazer.
   */
  let de = p.get("de");
  let ate = p.get("ate");
  const mesVenc = p.get("mesVencimento");
  if (!de && !ate && mesVenc) {
    const [ano, mes] = mesVenc.split("-").map(Number);
    if (ano && mes) {
      de = `${ano}-${String(mes).padStart(2, "0")}-01`;
      ate = new Date(ano, mes, 0).toISOString().slice(0, 10);
    }
  }
  if (de) q = q.gte("vencimento", de);
  if (ate) q = q.lte("vencimento", ate);

  /*
   * Visão padrão: o que vence neste mês, mais tudo que ficou para trás e
   * ainda não foi entregue. Sem isso a tela virava um arquivo histórico e o
   * mês corrente se perdia no meio.
   *
   * Período, competência ou "vencidas" explícitos desligam o padrão: aí a
   * pessoa está procurando um recorte específico e deve ver exatamente ele.
   */
  const semRecorte =
    competencias.length || de || ate || filtro === "vencidas" || p.get("tudo") === "1";

  if (!semRecorte) {
    const hoje = new Date();
    const primeiroDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
    // dia 0 do mês seguinte é o último dia deste mês
    const ultimoDoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

    /*
     * O mês corrente **fechado**, mais o que ficou atrasado e ainda está em
     * aberto. O "ou" precisa ser uma condição só, senão o recorte do mês
     * esconderia justamente as contas atrasadas que exigem ação.
     *
     * O limite superior importa: sem ele o corte era "do dia 1º em diante" e
     * trazia junto o que vence nos meses seguintes. Com as competências de
     * novembro abertas, a lista de outubro passou de 26 para 35 linhas — e o
     * mês corrente, que é o que se fecha agora, se perdia no meio.
     */
    q = q.or(
      `and(vencimento.gte.${primeiroDoMes},vencimento.lte.${ultimoDoMes}),` +
        `and(vencimento.lt.${primeiroDoMes},status.in.(aguardando_documentos,documentos_recebidos,em_aprovacao))`
    );
  }

  /* Degraus de alerta por proximidade do vencimento. Contas já pagas ou
     canceladas ficam de fora: não há o que acompanhar nelas. */
  if (filtro === "hoje" || filtro === "urgente" || filtro === "mes") {
    const hoje = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    // assinada e entregue é fatura encerrada: não entra em alerta de vencimento
    q = q.not("status", "in", "(paga,entregue_contabilidade,lancada_winthor,cancelada)");

    if (filtro === "hoje") {
      q = q.eq("vencimento", iso(hoje));
    } else if (filtro === "urgente") {
      // de hoje até duas semanas à frente
      const limite = new Date(hoje);
      limite.setDate(limite.getDate() + 14);
      q = q.gte("vencimento", iso(hoje)).lte("vencimento", iso(limite));
    } else {
      // qualquer vencimento dentro do mês corrente
      const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      q = q.gte("vencimento", iso(primeiro)).lte("vencimento", iso(ultimo));
    }
  }
  if (busca) {
    const termo = busca.replace(/[%,()]/g, "");
    q = q.or(`fornecedor_nome.ilike.%${termo}%,conta_descricao.ilike.%${termo}%`);
  }

  return q.order("vencimento", { ascending: true });
}
