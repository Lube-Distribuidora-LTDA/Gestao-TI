/**
 * Leitura dos dados que estão DENTRO do documento.
 *
 * Antes, número da nota, valor e vencimento vinham de heurística sobre o
 * assunto do e-mail e o nome do arquivo — e erravam. O que vale é o que está
 * no documento: a NFS-e Nacional traz tudo estruturado em XML, e o boleto traz
 * vencimento e valor escritos no texto.
 *
 * A ordem de confiança é: XML da nota > texto do PDF > nada. Nenhum campo é
 * inventado: o que não for encontrado volta indefinido, e quem chamou decide.
 */

export type DadosDocumento = {
  numeroNota?: string;
  /** Valor bruto da nota (base de cálculo). */
  valorTotal?: number;
  /** O que efetivamente se paga, já com as retenções descontadas. */
  valorLiquido?: number;
  /** YYYY-MM-DD */
  vencimento?: string;
  /** YYYY-MM-01 — mês de referência do serviço. */
  competencia?: string;
  emitente?: string;
  cnpjEmitente?: string;
  descricaoServico?: string;
  fonte: "xml_nfse" | "pdf_texto" | "nao_identificado";
  confianca: "alta" | "media" | "baixa";
};

/* ------------------------------------------------------------------ */
/* XML — NFS-e Nacional                                                */
/* ------------------------------------------------------------------ */

/** Primeiro valor de uma tag, ignorando prefixo de namespace. */
function tag(xml: string, nome: string): string | undefined {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}[^>]*>([^<]*)</(?:\\w+:)?${nome}>`, "i"));
  return m ? m[1].trim() : undefined;
}

function numero(v: string | undefined): number | undefined {
  if (!v) return undefined;
  // o XML usa ponto decimal; o texto do PDF usa vírgula
  const n = Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Procura uma data de vencimento em texto livre. */
function vencimentoEmTexto(texto: string): string | undefined {
  const t = texto.replace(/\s+/g, " ");

  const padroes = [
    /*
     * "Data de Vencimento 1ª Parcela: 01/10/2026" — o trecho entre o rótulo e
     * a data pode conter dígitos ("1ª"), então aqui não dá para exigir só
     * não-dígitos; o quantificador preguiçoso para na primeira data completa.
     */
    /vencimento.{0,40}?(\d{2})[/.-](\d{2})[/.-](\d{4})/i,
    /venc\w*.{0,12}?(\d{2})[/.-](\d{2})[/.-](\d{4})/i,
  ];

  for (const p of padroes) {
    const m = t.match(p);
    if (m) {
      const [, d, mes, a] = m;
      const dia = Number(d), mm = Number(mes);
      if (dia >= 1 && dia <= 31 && mm >= 1 && mm <= 12) return `${a}-${mes}-${d}`;
    }
  }
  return undefined;
}

export function extrairDeXmlNfse(xml: string): DadosDocumento | null {
  if (!/<(?:\w+:)?(NFSe|CompNfse|Nfse|InfNfse|infNFSe)/i.test(xml)) return null;

  // NFS-e Nacional usa nNFSe; os padrões municipais antigos usam Numero
  const numeroNota = tag(xml, "nNFSe") ?? tag(xml, "Numero") ?? tag(xml, "NumeroNfse");

  // `valores` aparece mais de uma vez (a segunda é do bloco IBS/CBS);
  // a primeira é a que traz ISSQN e líquido
  const blocoValores = xml.match(/<(?:\w+:)?valores[^>]*>([\s\S]*?)<\/(?:\w+:)?valores>/i)?.[1] ?? xml;

  const valorTotal =
    numero(tag(blocoValores, "vBC")) ??
    numero(tag(xml, "vServ")) ??
    numero(tag(xml, "ValorServicos"));

  const valorLiquido =
    numero(tag(blocoValores, "vLiq")) ??
    numero(tag(xml, "ValorLiquidoNfse"));

  // dCompet vem como AAAA-MM-DD
  const compet = tag(xml, "dCompet") ?? tag(xml, "Competencia");
  const competencia = compet?.match(/^(\d{4})-(\d{2})/)
    ? `${compet.slice(0, 7)}-01`
    : undefined;

  // o vencimento não tem campo próprio na NFS-e: vem no texto complementar
  const complemento =
    tag(xml, "xInfComp") ?? tag(xml, "OutrasInformacoes") ?? "";
  const descricaoServico = tag(xml, "xDescServ") ?? tag(xml, "Discriminacao");

  const vencimento =
    vencimentoEmTexto(complemento) ?? vencimentoEmTexto(descricaoServico ?? "");

  return {
    numeroNota,
    valorTotal,
    valorLiquido,
    vencimento,
    competencia,
    emitente: tag(xml, "xNome") ?? tag(xml, "RazaoSocial"),
    cnpjEmitente: tag(xml, "CNPJ"),
    descricaoServico: descricaoServico?.slice(0, 400),
    fonte: "xml_nfse",
    confianca: "alta",
  };
}

/* ------------------------------------------------------------------ */
/* PDF — boleto e fatura                                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Linha digitável — a fonte mais confiável de um boleto               */
/* ------------------------------------------------------------------ */

/**
 * Converte o fator de vencimento da FEBRABAN em data.
 *
 * O fator conta dias desde 07/10/1997. Ele chegou a 9999 em 21/02/2025 e
 * reiniciou em 1000 no dia seguinte, então as duas contagens convivem em
 * boletos antigos e novos. Calculamos as duas e ficamos com a data plausível
 * — a que cai perto de hoje.
 */
function dataDoFator(fator: number): string | undefined {
  if (!Number.isFinite(fator) || fator <= 0) return undefined;

  const candidatas = [
    new Date(Date.UTC(1997, 9, 7) + fator * 86_400_000),
    new Date(Date.UTC(2025, 1, 22) + (fator - 1000) * 86_400_000),
  ];

  const agora = Date.now();
  const JANELA = 1100 * 86_400_000; // ~3 anos para cada lado

  const plausiveis = candidatas.filter((d) => Math.abs(d.getTime() - agora) < JANELA);
  const escolhida = (plausiveis.length ? plausiveis : candidatas).sort(
    (a, b) => Math.abs(a.getTime() - agora) - Math.abs(b.getTime() - agora)
  )[0];

  return escolhida.toISOString().slice(0, 10);
}

/**
 * Dígito verificador módulo 10, usado nos três primeiros campos da linha
 * digitável. É ele que separa um boleto de verdade de uma sequência de
 * números qualquer que apareceu no texto.
 */
function dvModulo10(campo: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = campo.length - 1; i >= 0; i--) {
    const p = Number(campo[i]) * peso;
    soma += p > 9 ? p - 9 : p;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

/** Confere os três dígitos verificadores de uma linha digitável de 47 posições. */
function linhaDigitavelValida(d: string): boolean {
  if (d.length !== 47) return false;
  return (
    dvModulo10(d.slice(0, 9)) === Number(d[9]) &&
    dvModulo10(d.slice(10, 20)) === Number(d[20]) &&
    dvModulo10(d.slice(21, 31)) === Number(d[31])
  );
}

/**
 * Lê vencimento e valor da linha digitável do boleto.
 *
 * Os últimos 14 dígitos trazem 4 de fator de vencimento e 10 de valor em
 * centavos — informação padronizada pela FEBRABAN, muito mais confiável que
 * procurar "Vencimento:" no texto, ainda mais porque o PDF de boleto costuma
 * sair com rótulos e valores em ordem trocada.
 *
 * Os dígitos verificadores são conferidos antes de aceitar qualquer coisa.
 * Sem essa checagem, qualquer amontoado de números do PDF virava um boleto:
 * numa prova com os documentos reais, isso produziu vencimentos em 2024 e
 * valores de R$ 180 mil.
 */
function dadosDaLinhaDigitavel(texto: string): { vencimento?: string; valor?: number } {
  // junta blocos separados por espaço, ponto ou hífen, como o boleto imprime
  const sequencias = [...texto.matchAll(/[\d][\d.\s-]{44,90}[\d]/g)]
    .map((m) => m[0].replace(/\D/g, ""))
    .filter((d) => d.length >= 44);

  for (const seq of sequencias) {
    // a sequência pode vir grudada em outros números: testamos cada janela
    for (let i = 0; i + 47 <= seq.length; i++) {
      const dig = seq.slice(i, i + 47);
      if (!linhaDigitavelValida(dig)) continue;

      const bloco = dig.slice(-14);
      const vencimento = dataDoFator(parseInt(bloco.slice(0, 4), 10));
      const centavos = parseInt(bloco.slice(4), 10);
      const valor = Number.isFinite(centavos) && centavos > 0 ? centavos / 100 : undefined;

      if (vencimento) return { vencimento, valor };
    }
  }

  return {};
}

/**
 * Valor nomeado no texto do documento.
 *
 * Só aceita número que venha logo depois de um rótulo que o identifique como
 * total. Não existe mais o antigo "pegue o maior número da página": num teste
 * com os documentos reais, aquilo colava pedaços de outros campos e produzia
 * valores como R$ 263.707,97 no lugar de R$ 3.707,97.
 *
 * Quando nada é reconhecido com segurança, devolve indefinido — a tela mostra
 * o previsto e a pessoa confere, em vez de exibir um número inventado.
 */
function valorEmTexto(texto: string): number | undefined {
  const t = texto.replace(/\s+/g, " ");

  const rotulados = [
    /\(=\)\s*valor\s*(?:do\s*)?documento[^\d]{0,20}(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /valor\s*l[íi]quido\s*(?:da\s*nfs-?e)?[^\d]{0,20}(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /valor\s*total\s*(?:da\s*(?:nota|nfs-?e)|do\s*documento)?[^\d]{0,20}(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /valor\s*(?:a\s*pagar|cobrado)[^\d]{0,20}(\d{1,3}(?:\.\d{3})*,\d{2})/i,
  ];

  for (const p of rotulados) {
    const m = t.match(p);
    const n = numero(m?.[1]);
    // um valor plausível de nota de serviço; acima disso é leitura equivocada
    if (n && n < 1_000_000) return n;
  }

  return undefined;
}

export function extrairDeTextoPdf(texto: string): DadosDocumento {
  const numeroNota =
    texto.match(/(?:n[ºo°.]?\s*(?:da\s*)?nota|nfs-?e\s*n[ºo°.]?|n[úu]mero\s*da\s*nfs-?e)[^\d]{0,12}(\d{2,10})/i)?.[1] ??
    texto.match(/(?:fatura|duplicata)\s*(?:n[ºo°.]?)\s*(\d{2,10})/i)?.[1];

  // a linha digitável ganha do texto solto: é padronizada e verificada
  const codigo = dadosDaLinhaDigitavel(texto);

  return {
    numeroNota,
    valorTotal: codigo.valor ?? valorEmTexto(texto),
    vencimento: codigo.vencimento ?? vencimentoEmTexto(texto),
    fonte: "pdf_texto",
    confianca: codigo.vencimento ? "alta" : "media",
  };
}

/** Lê o anexo conforme o tipo de arquivo. */
export async function extrairDados(
  nomeArquivo: string,
  conteudo: Buffer
): Promise<DadosDocumento> {
  const nada: DadosDocumento = { fonte: "nao_identificado", confianca: "baixa" };

  try {
    if (/\.xml$/i.test(nomeArquivo)) {
      return extrairDeXmlNfse(conteudo.toString("utf8")) ?? nada;
    }

    if (/\.pdf$/i.test(nomeArquivo)) {
      /*
       * Importado sob demanda (a biblioteca é pesada) e pelo módulo interno:
       * o index.js do pdf-parse tenta abrir um PDF de teste quando é carregado
       * como ESM, e quebra com ENOENT antes de exportar qualquer coisa.
       */
      const mod = await import("pdf-parse/lib/pdf-parse.js");
      const pdfParse = mod.default ?? mod;
      const { text } = await pdfParse(conteudo);
      return extrairDeTextoPdf(text);
    }
  } catch {
    // documento corrompido ou protegido não pode derrubar a varredura
  }

  return nada;
}

/**
 * Junta o que veio de vários anexos do mesmo e-mail.
 *
 * A nota fiscal manda no número e no valor; o boleto manda no vencimento,
 * porque é ele que o banco vai cobrar. Campo já preenchido por fonte de
 * confiança alta não é sobrescrito por fonte de confiança menor.
 */
export function consolidar(partes: Array<{ tipo: string; dados: DadosDocumento }>): DadosDocumento {
  const saida: DadosDocumento = { fonte: "nao_identificado", confianca: "baixa" };
  const peso = { alta: 3, media: 2, baixa: 1 } as const;
  const forca: Record<string, number> = {};

  const por = (campo: keyof DadosDocumento, valor: unknown, conf: keyof typeof peso) => {
    if (valor === undefined || valor === null || valor === "") return;
    if ((forca[campo] ?? 0) >= peso[conf]) return;
    (saida as Record<string, unknown>)[campo] = valor;
    forca[campo] = peso[conf];
  };

  for (const { tipo, dados } of partes) {
    const ehNota = tipo === "nota_fiscal";
    const ehCobranca = tipo === "boleto" || tipo === "fatura";

    // o boleto é a autoridade sobre a data de pagamento
    por("vencimento", dados.vencimento, ehCobranca ? "alta" : dados.confianca);

    // a nota é a autoridade sobre número e valores
    por("numeroNota", dados.numeroNota, ehNota ? dados.confianca : "baixa");
    por("valorTotal", dados.valorTotal, ehNota ? dados.confianca : "media");
    por("valorLiquido", dados.valorLiquido, ehNota ? dados.confianca : "baixa");

    por("competencia", dados.competencia, dados.confianca);
    por("emitente", dados.emitente, dados.confianca);
    por("cnpjEmitente", dados.cnpjEmitente, dados.confianca);
    por("descricaoServico", dados.descricaoServico, dados.confianca);

    if (dados.fonte !== "nao_identificado" && saida.fonte === "nao_identificado") {
      saida.fonte = dados.fonte;
    }
    if (peso[dados.confianca] > peso[saida.confianca]) saida.confianca = dados.confianca;
  }

  return saida;
}
