-- =====================================================
-- Migration 02: Chamados, robo de e-mail, ativos
-- =====================================================

create type status_chamado as enum ('aberto','em_atendimento','aguardando_usuario','resolvido','fechado','cancelado');
create type prioridade_chamado as enum ('baixa','media','alta','critica');
create type autor_mensagem as enum ('solicitante','tecnico','sistema');

-- ---------- CHAMADOS ----------
create table public.chamados (
  id                uuid primary key default gen_random_uuid(),
  protocolo         text not null unique,
  solicitante_nome  text not null,
  solicitante_email text not null,
  solicitante_setor text,
  solicitante_ramal text,
  categoria         text not null default 'Outros',
  titulo            text not null,
  descricao         text not null,
  prioridade        prioridade_chamado not null default 'media',
  status            status_chamado not null default 'aberto',
  token_acesso      uuid not null default gen_random_uuid(),
  responsavel       text,
  equipamento       text,
  localizacao       text,
  aberto_em         timestamptz not null default now(),
  primeira_resposta_em timestamptz,
  resolvido_em      timestamptz,
  fechado_em        timestamptz,
  solucao           text,
  avaliacao         int check (avaliacao between 1 and 5),
  atualizado_em     timestamptz not null default now()
);
comment on column public.chamados.token_acesso is 'Token do link que o solicitante usa para acompanhar o chamado sem login';

create index idx_chamados_status     on public.chamados(status);
create index idx_chamados_prioridade on public.chamados(prioridade);
create index idx_chamados_aberto_em  on public.chamados(aberto_em desc);
create index idx_chamados_token      on public.chamados(token_acesso);
create index idx_chamados_email      on public.chamados(solicitante_email);

-- ---------- MENSAGENS DO CHAMADO ----------
create table public.chamado_mensagens (
  id           uuid primary key default gen_random_uuid(),
  chamado_id   uuid not null references public.chamados(id) on delete cascade,
  autor        autor_mensagem not null,
  autor_nome   text,
  mensagem     text not null,
  interna      boolean not null default false,   -- anotacao que o solicitante nao ve
  notificado   boolean not null default false,   -- ja mandou e-mail avisando?
  criado_em    timestamptz not null default now()
);

create index idx_chamado_mensagens_chamado on public.chamado_mensagens(chamado_id, criado_em);

-- ---------- SEQUENCIA DE PROTOCOLO ----------
create sequence if not exists public.seq_protocolo_chamado start 1;

create or replace function public.gerar_protocolo()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  n := nextval('public.seq_protocolo_chamado');
  return 'TI-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 5, '0');
end;
$$;

create or replace function public.trg_set_protocolo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.protocolo is null or new.protocolo = '' then
    new.protocolo := public.gerar_protocolo();
  end if;
  return new;
end;
$$;

create trigger set_protocolo
  before insert on public.chamados
  for each row execute function public.trg_set_protocolo();

-- ---------- CONTROLE DE E-MAILS PROCESSADOS (idempotencia do robo) ----------
create table public.emails_processados (
  id            uuid primary key default gen_random_uuid(),
  message_id    text not null unique,
  uid           bigint,
  remetente     text,
  assunto       text,
  recebido_em   timestamptz,
  processado_em timestamptz not null default now(),
  fatura_id     uuid references public.faturas(id) on delete set null,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  anexos_salvos int not null default 0,
  resultado     text   -- vinculado | ignorado | sem_correspondencia | erro
);
comment on table public.emails_processados is 'Garante que o mesmo e-mail nunca seja processado duas vezes';

create index idx_emails_processados_msgid on public.emails_processados(message_id);

-- ---------- EXECUCOES DO ROBO ----------
create table public.robo_execucoes (
  id                  uuid primary key default gen_random_uuid(),
  tipo                text not null,   -- leitura_email | cobranca | geracao_faturas
  iniciado_em         timestamptz not null default now(),
  finalizado_em       timestamptz,
  sucesso             boolean,
  emails_lidos        int not null default 0,
  documentos_vinculados int not null default 0,
  cobrancas_enviadas  int not null default 0,
  detalhes            jsonb,
  erro                text
);

create index idx_robo_execucoes_data on public.robo_execucoes(iniciado_em desc);

-- ---------- ATIVOS DE TI (inventario) ----------
create type status_ativo as enum ('em_uso','estoque','manutencao','descartado');

create table public.ativos (
  id              uuid primary key default gen_random_uuid(),
  patrimonio      text unique,
  tipo            text not null default 'Computador',
  marca           text,
  modelo          text,
  numero_serie    text,
  usuario_atual   text,
  setor           text,
  localizacao     text,
  status          status_ativo not null default 'em_uso',
  data_aquisicao  date,
  valor_aquisicao numeric(14,2),
  garantia_ate    date,
  fornecedor_id   uuid references public.fornecedores(id) on delete set null,
  especificacoes  text,
  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index idx_ativos_status on public.ativos(status);
create index idx_ativos_setor  on public.ativos(setor);

-- ---------- CONFIGURACOES ----------
create table public.configuracoes (
  chave       text primary key,
  valor       text,
  descricao   text,
  atualizado_em timestamptz not null default now()
);
;