-- =====================================================
-- GESTÃO DE TI - LUBE DISTRIBUIDORA
-- Migration 01: Cadastros base
-- =====================================================

create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
create type periodicidade_conta as enum ('mensal','bimestral','trimestral','semestral','anual','avulso');

create type status_fatura as enum (
  'aguardando_documentos',  -- competência aberta, fornecedor ainda não mandou nada
  'documentos_recebidos',   -- NF e/ou fatura chegaram
  'em_aprovacao',           -- conferida, aguardando pagamento
  'paga',
  'cancelada'
);

create type tipo_documento as enum ('nota_fiscal','fatura','boleto','contrato','outro');

create type origem_documento as enum ('email','upload_manual');

create type status_cobranca as enum ('pendente','enviada','erro','cancelada');

-- ---------- CATEGORIAS DE CUSTO ----------
create table public.categorias_custo (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  descricao   text,
  cor         text not null default '#1E3A8A',
  icone       text not null default 'Folder',
  ordem       int  not null default 0,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);
comment on table public.categorias_custo is 'Agrupadores de custo do departamento de TI (links, licencas, telefonia, etc)';

-- ---------- FORNECEDORES ----------
create table public.fornecedores (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  razao_social      text,
  cnpj              text,
  email_cobranca    text,                -- para onde o robo envia a cobranca de NF
  emails_remetentes text[] not null default '{}',  -- de quais enderecos ele ENVIA os documentos
  telefone          text,
  contato_nome      text,
  site              text,
  observacoes       text,
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
comment on column public.fornecedores.emails_remetentes is 'Enderecos usados para casar e-mails recebidos com este fornecedor';

create index idx_fornecedores_ativo on public.fornecedores(ativo);

-- ---------- CONTAS / CONTRATOS ----------
create table public.contas (
  id                 uuid primary key default gen_random_uuid(),
  fornecedor_id      uuid not null references public.fornecedores(id) on delete restrict,
  categoria_id       uuid references public.categorias_custo(id) on delete set null,
  descricao          text not null,
  identificador      text,                      -- n. do contrato, linha, CNPJ da filial...
  valor_previsto     numeric(14,2) not null default 0,
  periodicidade      periodicidade_conta not null default 'mensal',
  dia_vencimento     int check (dia_vencimento between 1 and 31),
  exige_nota_fiscal  boolean not null default true,
  exige_fatura       boolean not null default true,
  -- regras do robo de cobranca
  cobranca_ativa        boolean not null default true,
  dias_antes_vencimento int not null default 5,   -- comeca a cobrar N dias antes do vencimento
  intervalo_cobranca_dias int not null default 3, -- espera N dias entre uma cobranca e outra
  max_cobrancas         int not null default 4,
  palavras_chave     text[] not null default '{}', -- ajuda a casar o assunto do e-mail
  centro_custo       text,
  ativo              boolean not null default true,
  observacoes        text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

create index idx_contas_fornecedor on public.contas(fornecedor_id);
create index idx_contas_categoria  on public.contas(categoria_id);
create index idx_contas_ativo      on public.contas(ativo);

-- ---------- FATURAS (competencia por conta) ----------
create table public.faturas (
  id                   uuid primary key default gen_random_uuid(),
  conta_id             uuid not null references public.contas(id) on delete cascade,
  competencia          date not null,             -- sempre dia 01 do mes de referencia
  vencimento           date not null,
  valor_previsto       numeric(14,2) not null default 0,
  valor_real           numeric(14,2),             -- valor efetivo da fatura recebida
  status               status_fatura not null default 'aguardando_documentos',
  nota_fiscal_recebida_em timestamptz,
  fatura_recebida_em      timestamptz,
  pago_em              date,
  numero_nota          text,
  numero_documento     text,
  cobrancas_enviadas   int not null default 0,
  ultima_cobranca_em   timestamptz,
  observacoes          text,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  unique (conta_id, competencia)
);

create index idx_faturas_status      on public.faturas(status);
create index idx_faturas_competencia on public.faturas(competencia);
create index idx_faturas_vencimento  on public.faturas(vencimento);

-- ---------- DOCUMENTOS ANEXOS ----------
create table public.documentos (
  id             uuid primary key default gen_random_uuid(),
  fatura_id      uuid references public.faturas(id) on delete cascade,
  fornecedor_id  uuid references public.fornecedores(id) on delete set null,
  tipo           tipo_documento not null default 'outro',
  nome_arquivo   text not null,
  storage_path   text,
  tamanho_bytes  bigint,
  mime_type      text,
  origem         origem_documento not null default 'upload_manual',
  email_message_id text,
  email_assunto    text,
  email_remetente  text,
  recebido_em    timestamptz not null default now(),
  criado_em      timestamptz not null default now()
);

create index idx_documentos_fatura on public.documentos(fatura_id);

-- ---------- LOG DE COBRANCAS ----------
create table public.cobrancas (
  id             uuid primary key default gen_random_uuid(),
  fatura_id      uuid not null references public.faturas(id) on delete cascade,
  tentativa      int not null default 1,
  destinatario   text not null,
  assunto        text not null,
  corpo          text not null,
  status         status_cobranca not null default 'pendente',
  enviada_em     timestamptz,
  erro           text,
  automatica     boolean not null default true,
  criado_em      timestamptz not null default now()
);

create index idx_cobrancas_fatura on public.cobrancas(fatura_id);
create index idx_cobrancas_status on public.cobrancas(status);
;