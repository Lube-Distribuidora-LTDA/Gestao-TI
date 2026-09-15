/** Tipos e rótulos compartilhados entre servidor e cliente. */

export type StatusFatura =
  | "aguardando_documentos"
  | "documentos_recebidos"
  | "em_aprovacao"
  | "paga"
  | "cancelada";

export type StatusChamado =
  | "aberto"
  | "em_atendimento"
  | "aguardando_usuario"
  | "resolvido"
  | "fechado"
  | "cancelado";

export type PrioridadeChamado = "baixa" | "media" | "alta" | "critica";
export type TipoDocumento = "nota_fiscal" | "fatura" | "boleto" | "contrato" | "outro";
export type Periodicidade = "mensal" | "bimestral" | "trimestral" | "semestral" | "anual" | "avulso";
export type StatusAtivo = "em_uso" | "estoque" | "manutencao" | "descartado";

type Estilo = { label: string; classe: string; ponto: string };

export const STATUS_FATURA: Record<StatusFatura, Estilo> = {
  aguardando_documentos: {
    label: "Aguardando documentos",
    classe: "border-amber-400/35 bg-amber-400/12 text-amber-200",
    ponto: "bg-amber-400",
  },
  documentos_recebidos: {
    label: "Documentos recebidos",
    classe: "border-sky-400/35 bg-sky-400/12 text-sky-200",
    ponto: "bg-sky-400",
  },
  em_aprovacao: {
    label: "Em aprovação",
    classe: "border-violet-400/35 bg-violet-400/12 text-violet-200",
    ponto: "bg-violet-400",
  },
  paga: {
    label: "Paga",
    classe: "border-emerald-400/35 bg-emerald-400/12 text-emerald-200",
    ponto: "bg-emerald-400",
  },
  cancelada: {
    label: "Cancelada",
    classe: "border-slate-400/30 bg-slate-400/10 text-slate-300",
    ponto: "bg-slate-400",
  },
};

export const STATUS_CHAMADO: Record<StatusChamado, Estilo> = {
  aberto: {
    label: "Aberto",
    classe: "border-brand-red/45 bg-[#ee1c25]/12 text-red-200",
    ponto: "bg-[#ee1c25]",
  },
  em_atendimento: {
    label: "Em atendimento",
    classe: "border-sky-400/35 bg-sky-400/12 text-sky-200",
    ponto: "bg-sky-400",
  },
  aguardando_usuario: {
    label: "Aguardando usuário",
    classe: "border-amber-400/35 bg-amber-400/12 text-amber-200",
    ponto: "bg-amber-400",
  },
  resolvido: {
    label: "Resolvido",
    classe: "border-emerald-400/35 bg-emerald-400/12 text-emerald-200",
    ponto: "bg-emerald-400",
  },
  fechado: {
    label: "Fechado",
    classe: "border-slate-400/30 bg-slate-400/10 text-slate-300",
    ponto: "bg-slate-400",
  },
  cancelado: {
    label: "Cancelado",
    classe: "border-slate-400/30 bg-slate-400/10 text-slate-400",
    ponto: "bg-slate-500",
  },
};

export const PRIORIDADE: Record<PrioridadeChamado, Estilo & { peso: number }> = {
  baixa: {
    label: "Baixa",
    classe: "border-slate-400/30 bg-slate-400/10 text-slate-300",
    ponto: "bg-slate-400",
    peso: 1,
  },
  media: {
    label: "Média",
    classe: "border-sky-400/35 bg-sky-400/12 text-sky-200",
    ponto: "bg-sky-400",
    peso: 2,
  },
  alta: {
    label: "Alta",
    classe: "border-amber-400/40 bg-amber-400/12 text-amber-200",
    ponto: "bg-amber-400",
    peso: 3,
  },
  critica: {
    label: "Crítica",
    classe: "border-[#ee1c25]/50 bg-[#ee1c25]/15 text-red-200",
    ponto: "bg-[#ee1c25]",
    peso: 4,
  },
};

export const TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  nota_fiscal: "Nota fiscal",
  fatura: "Fatura",
  boleto: "Boleto",
  contrato: "Contrato",
  outro: "Outro",
};

export const PERIODICIDADE: Record<Periodicidade, string> = {
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  avulso: "Avulso",
};

export const STATUS_ATIVO: Record<StatusAtivo, Estilo> = {
  em_uso: {
    label: "Em uso",
    classe: "border-emerald-400/35 bg-emerald-400/12 text-emerald-200",
    ponto: "bg-emerald-400",
  },
  estoque: {
    label: "Em estoque",
    classe: "border-sky-400/35 bg-sky-400/12 text-sky-200",
    ponto: "bg-sky-400",
  },
  manutencao: {
    label: "Manutenção",
    classe: "border-amber-400/35 bg-amber-400/12 text-amber-200",
    ponto: "bg-amber-400",
  },
  descartado: {
    label: "Descartado",
    classe: "border-slate-400/30 bg-slate-400/10 text-slate-400",
    ponto: "bg-slate-500",
  },
};

export const CATEGORIAS_CHAMADO = [
  "Computador / Notebook",
  "Impressora",
  "Internet / Rede",
  "Telefonia / Ramal",
  "E-mail",
  "Sistema / ERP",
  "Acesso e senha",
  "Instalação de software",
  "Periférico",
  "Outros",
] as const;

export const SETORES = [
  "Administrativo",
  "Comercial",
  "Compras",
  "Contabilidade",
  "Diretoria",
  "Expedição",
  "Estoque",
  "Faturamento",
  "Financeiro",
  "Fiscal",
  "Logística",
  "Manutenção",
  "Marketing",
  "RH",
  "TI",
  "Transporte",
  "Vendas",
  "Outro",
] as const;

export const TIPOS_ATIVO = [
  "Computador",
  "Notebook",
  "Monitor",
  "Impressora",
  "Servidor",
  "Switch",
  "Roteador",
  "Nobreak",
  "Telefone IP",
  "Coletor",
  "Celular",
  "Tablet",
  "Periférico",
  "Outro",
] as const;

/** Uma fatura só é liberada quando todos os documentos exigidos chegaram. */
export function documentosCompletos(f: {
  exige_nota_fiscal: boolean;
  exige_fatura: boolean;
  nota_fiscal_recebida_em: string | null;
  fatura_recebida_em: string | null;
}): boolean {
  const nfOk = !f.exige_nota_fiscal || !!f.nota_fiscal_recebida_em;
  const fatOk = !f.exige_fatura || !!f.fatura_recebida_em;
  return nfOk && fatOk;
}

/** O que ainda falta chegar, para exibir na tela e no e-mail de cobrança. */
export function documentosFaltantes(f: {
  exige_nota_fiscal: boolean;
  exige_fatura: boolean;
  nota_fiscal_recebida_em: string | null;
  fatura_recebida_em: string | null;
}): string[] {
  const faltam: string[] = [];
  if (f.exige_nota_fiscal && !f.nota_fiscal_recebida_em) faltam.push("nota fiscal");
  if (f.exige_fatura && !f.fatura_recebida_em) faltam.push("fatura/boleto");
  return faltam;
}
