/**
 * Identidade visual da Lube, fora do React.
 *
 * O painel desenha a marca em SVG (components/LogoLube.tsx), mas uma planilha
 * do Excel só aceita imagem rasterizada. Aqui o mesmo desenho vira PNG uma vez
 * por processo — o custo de rasterizar não se paga a cada exportação.
 */

/** As cores que o painel usa, para a planilha sair com a mesma cara. */
export const CORES = {
  /** fundo dos cards e das faixas escuras */
  azulEscuro: "0E1742",
  /** azul da marca, usado em títulos e no cabeçalho da tabela */
  azul: "16225F",
  azulMedio: "3A50C7",
  /** vermelho da marca */
  vermelho: "EE1C25",
  /** texto claro sobre fundo escuro */
  claro: "E8EDFF",
  /** linhas alternadas da tabela */
  zebra: "F2F5FF",
  /** bordas discretas */
  borda: "C8D3F5",
  texto: "1B2445",
  textoFraco: "5A6B9E",
  verde: "199E70",
  ambar: "D98E26",
} as const;

/* O mesmo "L" com o bloco vermelho do LogoLube, em fundo escuro para o Excel. */
const SVG_MARCA = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256">
  <defs>
    <linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3a50c7"/><stop offset="100%" stop-color="#16225f"/>
    </linearGradient>
    <linearGradient id="b" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff3b43"/><stop offset="100%" stop-color="#c40f18"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="12" fill="#0e1742"/>
  <path d="M10 8h13v33h18v15H10z" fill="url(#a)" stroke="rgba(255,255,255,.22)" stroke-width="1.2"/>
  <path d="M27 8h14a13 13 0 0 1 0 26H27z" fill="url(#b)" stroke="rgba(255,255,255,.22)" stroke-width="1.2"/>
</svg>`;

let pngEmCache: Buffer | null = null;

/** O logo em PNG, pronto para ser embutido numa planilha. */
export async function logoPNG(): Promise<Buffer> {
  if (pngEmCache) return pngEmCache;

  const { default: sharp } = await import("sharp");
  pngEmCache = await sharp(Buffer.from(SVG_MARCA)).png().toBuffer();
  return pngEmCache;
}
