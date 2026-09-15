/**
 * Whitelist do CRUD genérico.
 *
 * Só as tabelas listadas aqui são acessíveis pela rota /api/crud, e só as
 * colunas listadas podem ser gravadas. Qualquer campo extra que chegue no
 * corpo da requisição é descartado em silêncio — isso impede que alguém
 * grave em colunas de controle (id, criado_em, contadores do robô).
 */

export type ConfigTabela = {
  colunas: string[];
  ordem: { coluna: string; asc: boolean };
  busca?: string[];
};

export const TABELAS: Record<string, ConfigTabela> = {
  fornecedores: {
    colunas: [
      "nome", "razao_social", "cnpj", "email_cobranca", "emails_remetentes",
      "telefone", "contato_nome", "site", "observacoes", "ativo",
    ],
    ordem: { coluna: "nome", asc: true },
    busca: ["nome", "razao_social", "cnpj", "email_cobranca"],
  },

  contas: {
    colunas: [
      "fornecedor_id", "categoria_id", "descricao", "identificador", "valor_previsto",
      "periodicidade", "dia_vencimento", "exige_nota_fiscal", "exige_fatura",
      "cobranca_ativa", "dias_antes_vencimento", "intervalo_cobranca_dias",
      "max_cobrancas", "palavras_chave", "centro_custo", "ativo", "observacoes",
    ],
    ordem: { coluna: "descricao", asc: true },
    busca: ["descricao", "identificador", "centro_custo"],
  },

  categorias_custo: {
    colunas: ["nome", "descricao", "cor", "icone", "ordem", "ativo"],
    ordem: { coluna: "ordem", asc: true },
    busca: ["nome"],
  },

  ativos: {
    colunas: [
      "patrimonio", "tipo", "marca", "modelo", "numero_serie", "usuario_atual",
      "setor", "localizacao", "status", "data_aquisicao", "valor_aquisicao",
      "garantia_ate", "fornecedor_id", "especificacoes", "observacoes",
    ],
    ordem: { coluna: "patrimonio", asc: true },
    busca: ["patrimonio", "marca", "modelo", "numero_serie", "usuario_atual", "setor"],
  },
};

/** Remove do corpo tudo que não for coluna liberada. */
export function filtrarCampos(tabela: string, corpo: Record<string, unknown>): Record<string, unknown> {
  const cfg = TABELAS[tabela];
  if (!cfg) return {};

  const limpo: Record<string, unknown> = {};
  for (const col of cfg.colunas) {
    if (corpo[col] !== undefined) limpo[col] = corpo[col];
  }
  return limpo;
}

/** Converte erros crus do Postgres em mensagens que fazem sentido na tela. */
export function traduzirErro(msg: string): string {
  if (/duplicate key|already exists/i.test(msg)) return "Já existe um registro com esse valor único.";
  if (/violates foreign key/i.test(msg)) return "Registro vinculado a outro cadastro — verifique as dependências.";
  if (/violates not-null/i.test(msg)) return "Preencha todos os campos obrigatórios.";
  return msg;
}
