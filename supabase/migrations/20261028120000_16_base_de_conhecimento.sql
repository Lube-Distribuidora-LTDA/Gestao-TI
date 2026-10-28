-- ============================================================
-- 16. Base de conhecimento da TI
--
-- Artigos de "como resolver" escritos pela TI (aba do Kanban TI) e mostrados
-- a quem vai abrir chamado no portal: se a solução já está escrita, a pessoa
-- resolve sozinha e o chamado nem nasce (pedido do Júlio, 2026-10-28).
--
-- `categoria` usa os mesmos tipos de problema do formulário de chamado, para
-- o portal sugerir os artigos do tipo que a pessoa escolheu.
-- ============================================================

create table if not exists public.base_conhecimento (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  categoria text not null default 'Outros',
  conteudo text not null,
  -- termos que a pessoa digitaria e que não estão no título ("não imprime", "travou")
  palavras_chave text,
  -- rascunho fica só na aba da TI; publicado aparece no portal
  publicado boolean not null default true,
  -- quantas vezes foi aberto no portal e quantas a pessoa disse que resolveu
  visualizacoes int not null default 0,
  resolveu int not null default 0,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists ix_base_conhecimento_publicado on public.base_conhecimento (publicado, categoria);

drop trigger if exists t_base_conhecimento_upd on public.base_conhecimento;
-- só nas colunas de edição: o contador do portal não conta como "atualizado"
create trigger t_base_conhecimento_upd
  before update of titulo, categoria, conteudo, palavras_chave, publicado on public.base_conhecimento
  for each row execute function public.trg_atualizado_em();

-- Contador do portal num comando só, sem ler-e-gravar (duas pessoas ao mesmo
-- tempo não perdem a contagem) e sem mexer em atualizado_em, que é da edição.
create or replace function public.contar_base_conhecimento(p_id uuid, p_resolveu boolean)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.base_conhecimento
     set visualizacoes = visualizacoes + case when p_resolveu then 0 else 1 end,
         resolveu      = resolveu      + case when p_resolveu then 1 else 0 end
   where id = p_id and publicado;
$$;

-- Mesmo fechamento das demais tabelas: o navegador nunca fala com o banco,
-- tudo passa pelas rotas /api com a service_role.
alter table public.base_conhecimento enable row level security;
revoke all on public.base_conhecimento from anon, authenticated;
revoke all on function public.contar_base_conhecimento(uuid, boolean) from public, anon, authenticated;
grant execute on function public.contar_base_conhecimento(uuid, boolean) to service_role;
