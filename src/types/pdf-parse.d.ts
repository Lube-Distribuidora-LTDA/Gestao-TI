/**
 * O pdf-parse não traz tipos, e o módulo principal quebra quando importado
 * como ESM (tenta abrir um PDF de teste). Por isso importamos o arquivo
 * interno, que precisa desta declaração.
 */
declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(dados: Buffer | Uint8Array): Promise<{
    text: string;
    numpages: number;
    info: Record<string, unknown>;
  }>;
  export default pdfParse;
}
