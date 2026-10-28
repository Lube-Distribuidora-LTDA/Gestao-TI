import { CATEGORIAS_CHAMADO } from "@/lib/tipos";

/** Artigo da base de conhecimento (tabela `base_conhecimento`). */
export type Artigo = {
  id: string;
  titulo: string;
  categoria: string;
  conteudo: string;
  palavras_chave: string | null;
  publicado: boolean;
  visualizacoes: number;
  resolveu: number;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
};

/** O que o portal recebe: só o necessário para ler, sem contadores nem autor. */
export type ArtigoPublico = Pick<Artigo, "id" | "titulo" | "categoria" | "conteudo" | "palavras_chave">;

/** Lê e limpa os campos do artigo; devolve o erro em texto quando falta o obrigatório. */
export function lerArtigo(corpo: Record<string, unknown>) {
  const titulo = String(corpo.titulo ?? "").trim();
  const conteudo = String(corpo.conteudo ?? "").trim();
  if (titulo.length < 3) return { erro: "Dê um título ao artigo." } as const;
  if (conteudo.length < 10) return { erro: "Escreva a solução no conteúdo." } as const;

  const categoria = (CATEGORIAS_CHAMADO as readonly string[]).includes(String(corpo.categoria))
    ? String(corpo.categoria)
    : "Outros";

  return {
    dados: {
      titulo: titulo.slice(0, 200),
      categoria,
      conteudo: conteudo.slice(0, 20000),
      palavras_chave: corpo.palavras_chave ? String(corpo.palavras_chave).trim().slice(0, 500) : null,
      publicado: corpo.publicado !== false,
    },
  } as const;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palavras curtas e muito comuns não ajudam a achar artigo ("o", "de", "nao"). */
const VAZIAS = new Set(["a", "o", "e", "de", "da", "do", "das", "dos", "em", "no", "na", "um", "uma", "com", "por", "para", "pra", "que", "nao", "meu", "minha", "esta", "ta"]);

/**
 * Ordena os artigos pelo que a pessoa escreveu: título vale mais que palavra-chave, que vale
 * mais que o corpo; a categoria escolhida no formulário dá um empurrão. Só volta quem pontua.
 */
export function sugerir(artigos: ArtigoPublico[], texto: string, categoria?: string) {
  const termos = norm(texto)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !VAZIAS.has(t));
  return artigos
    .map((a) => {
      const t = norm(a.titulo), k = norm(a.palavras_chave ?? ""), c = norm(a.conteudo);
      let p = 0;
      for (const termo of termos) {
        if (t.includes(termo)) p += 3;
        else if (k.includes(termo)) p += 2;
        else if (c.includes(termo)) p += 1;
      }
      if (categoria && a.categoria === categoria) p += termos.length ? 1 : 2;
      return { a, p };
    })
    .filter((x) => x.p > 0)
    .sort((x, y) => y.p - x.p)
    .map((x) => x.a);
}
