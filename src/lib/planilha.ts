import ExcelJS from "exceljs";
import { CORES, logoPNG } from "./marca";

/**
 * Monta planilhas com a identidade visual do painel.
 *
 * O arquivo sai para fora da empresa e para a mesa de quem decide, então
 * precisa se parecer com o sistema de onde veio: mesma marca, mesmo azul,
 * mesma forma de escrever valor e data. Uma exportação anônima obriga quem
 * recebe a perguntar de onde aquilo saiu.
 */

export type Coluna<T> = {
  titulo: string;
  largura: number;
  valor: (linha: T) => string | number | null;
  /** "moeda" alinha à direita e formata como R$; "centro" só centraliza. */
  formato?: "moeda" | "centro";
  /** Soma a coluna no rodapé. Só faz sentido com formato "moeda". */
  somar?: boolean;
};

export type Planilha<T> = {
  /** Vai no topo e no nome da aba. */
  titulo: string;
  subtitulo?: string;
  /** Os filtros ativos, escritos como a pessoa os escolheu na tela. */
  filtros?: Array<{ rotulo: string; valor: string }>;
  colunas: Array<Coluna<T>>;
  linhas: T[];
};

const FONTE = "Calibri";

export async function gerarPlanilha<T>(p: Planilha<T>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestão de TI — Lube Distribuidora";
  wb.created = new Date();

  const aba = wb.addWorksheet(p.titulo.slice(0, 28), {
    views: [{ state: "frozen", ySplit: 0 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const ultimaCol = p.colunas.length;
  const letraFinal = aba.getColumn(ultimaCol).letter;

  p.colunas.forEach((c, i) => {
    aba.getColumn(i + 1).width = c.largura;
  });

  /* ---------- faixa da marca ---------- */
  // três linhas altas dão espaço ao logo sem espremer o título
  aba.getRow(1).height = 26;
  aba.getRow(2).height = 22;
  aba.getRow(3).height = 16;

  aba.mergeCells(`A1:${letraFinal}1`);
  aba.mergeCells(`A2:${letraFinal}2`);
  aba.mergeCells(`A3:${letraFinal}3`);

  for (const linha of [1, 2, 3]) {
    const cel = aba.getCell(`A${linha}`);
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${CORES.azulEscuro}` } };
  }

  const tituloCel = aba.getCell("A1");
  tituloCel.value = "LUBE DISTRIBUIDORA";
  tituloCel.font = { name: FONTE, size: 15, bold: true, color: { argb: `FF${CORES.claro}` } };
  tituloCel.alignment = { vertical: "middle", indent: 6 };

  const subCel = aba.getCell("A2");
  subCel.value = p.subtitulo ? `${p.titulo}  ·  ${p.subtitulo}` : p.titulo;
  subCel.font = { name: FONTE, size: 11, bold: true, color: { argb: "FF9FB0FF" } };
  subCel.alignment = { vertical: "middle", indent: 6 };

  const dataCel = aba.getCell("A3");
  dataCel.value = `Gerado em ${new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
  dataCel.font = { name: FONTE, size: 9, color: { argb: "FF8FA3E8" } };
  dataCel.alignment = { vertical: "middle", indent: 6 };

  try {
    const id = wb.addImage({ buffer: (await logoPNG()) as unknown as ExcelJS.Buffer, extension: "png" });
    // ancorado no canto, sobre a faixa escura
    aba.addImage(id, { tl: { col: 0.12, row: 0.2 }, ext: { width: 52, height: 52 } });
  } catch {
    /* sem logo a planilha continua válida — não vale derrubar a exportação */
  }

  let linhaAtual = 4;

  /* ---------- filtros aplicados ---------- */
  if (p.filtros?.length) {
    aba.getRow(linhaAtual).height = 18;
    aba.mergeCells(`A${linhaAtual}:${letraFinal}${linhaAtual}`);
    const cel = aba.getCell(`A${linhaAtual}`);
    cel.value = "Filtros:  " + p.filtros.map((f) => `${f.rotulo}: ${f.valor}`).join("      ");
    cel.font = { name: FONTE, size: 9.5, italic: true, color: { argb: `FF${CORES.textoFraco}` } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDF1FF" } };
    cel.alignment = { vertical: "middle", indent: 1 };
    linhaAtual++;
  }

  linhaAtual++; // respiro antes da tabela

  /* ---------- cabeçalho da tabela ---------- */
  const linhaCabecalho = linhaAtual;
  const cabecalho = aba.getRow(linhaCabecalho);
  cabecalho.height = 22;

  p.colunas.forEach((c, i) => {
    const cel = cabecalho.getCell(i + 1);
    cel.value = c.titulo;
    cel.font = { name: FONTE, size: 10, bold: true, color: { argb: `FF${CORES.claro}` } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${CORES.azul}` } };
    cel.alignment = {
      vertical: "middle",
      horizontal: c.formato === "moeda" ? "right" : c.formato === "centro" ? "center" : "left",
      indent: c.formato ? 0 : 1,
      wrapText: true,
    };
    cel.border = { bottom: { style: "medium", color: { argb: `FF${CORES.vermelho}` } } };
  });

  /* ---------- dados ---------- */
  p.linhas.forEach((item, n) => {
    const linha = aba.getRow(linhaCabecalho + 1 + n);
    linha.height = 17;

    p.colunas.forEach((c, i) => {
      const cel = linha.getCell(i + 1);
      const v = c.valor(item);
      cel.value = v;

      cel.font = { name: FONTE, size: 10, color: { argb: `FF${CORES.texto}` } };
      cel.alignment = {
        vertical: "middle",
        horizontal: c.formato === "moeda" ? "right" : c.formato === "centro" ? "center" : "left",
        indent: c.formato ? 0 : 1,
      };

      if (c.formato === "moeda") cel.numFmt = 'R$ #,##0.00';

      // zebra: a leitura de linhas longas se perde sem ela
      if (n % 2 === 1) {
        cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${CORES.zebra}` } };
      }
      cel.border = { bottom: { style: "hair", color: { argb: `FF${CORES.borda}` } } };
    });
  });

  /* ---------- totais ---------- */
  const temTotal = p.colunas.some((c) => c.somar);
  if (temTotal && p.linhas.length > 0) {
    const linha = aba.getRow(linhaCabecalho + 1 + p.linhas.length);
    linha.height = 21;

    p.colunas.forEach((c, i) => {
      const cel = linha.getCell(i + 1);
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3E9FF" } };
      cel.font = { name: FONTE, size: 10.5, bold: true, color: { argb: `FF${CORES.azul}` } };
      cel.border = { top: { style: "medium", color: { argb: `FF${CORES.azul}` } } };
      cel.alignment = {
        vertical: "middle",
        horizontal: c.formato === "moeda" ? "right" : "left",
        indent: c.formato ? 0 : 1,
      };

      if (i === 0) cel.value = `Total — ${p.linhas.length} registro(s)`;
      else if (c.somar) {
        cel.value = p.linhas.reduce((s, item) => s + Number(c.valor(item) ?? 0), 0);
        cel.numFmt = 'R$ #,##0.00';
      }
    });
  }

  /* Filtro do Excel na faixa de dados: quem recebe costuma querer reordenar,
     e sem o autoFilter teria que fazer isso na mão. */
  aba.autoFilter = {
    from: { row: linhaCabecalho, column: 1 },
    to: { row: linhaCabecalho + p.linhas.length, column: ultimaCol },
  };
  aba.views = [{ state: "frozen", ySplit: linhaCabecalho }];

  const saida = await wb.xlsx.writeBuffer();
  return Buffer.from(saida);
}
