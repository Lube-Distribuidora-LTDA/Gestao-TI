-- =====================================================
-- Migration 05: confiança da classificação automática + perfis de acesso
-- =====================================================

-- Quando o robô não tem certeza se o PDF é nota ou fatura, ele registra isso
-- em vez de fingir certeza. A tela pede confirmação humana.
alter table public.documentos
  add column if not exists confianca text not null default 'alta'
    check (confianca in ('alta','media','baixa')),
  add column if not exists confirmado_em timestamptz,
  add column if not exists confirmado_por text;

alter table public.faturas
  add column if not exists precisa_revisao boolean not null default false;

comment on column public.faturas.precisa_revisao is
  'Documento chegou mas o robô não conseguiu classificar com certeza; aguarda conferência humana';

-- ---------- PERFIS DO PAINEL ----------
-- Espelha auth.users com o papel de cada pessoa da TI.
create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default 'Usuário',
  email      text not null,
  papel      text not null default 'tecnico' check (papel in ('admin','tecnico','leitor')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

alter table public.perfis enable row level security;

-- Cria o perfil automaticamente quando um usuário é criado no Auth.
create or replace function public.trg_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, email, nome, papel)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    -- o primeiro usuário do sistema entra como admin
    case when (select count(*) from public.perfis) = 0 then 'admin' else 'tecnico' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.trg_novo_usuario();
;