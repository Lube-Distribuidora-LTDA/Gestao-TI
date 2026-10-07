-- ============================================================
-- 14. Kanban TI — quadro dos problemas internos do setor
--
-- Não tem relação com `chamados`: lá o usuário abre pedido pelo portal; aqui
-- é a própria TI organizando o que precisa resolver.
--
-- As colunas são dados, não enum: renomear uma coluna ou acrescentar outra é
-- um insert, não uma migração. Os nomes iniciais são os que o Júlio deu de
-- exemplo ao pedir o quadro.
-- ============================================================

create table if not exists public.kanban_colunas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem int not null,
  -- nome de cor, não hexadecimal: a tela traduz para a paleta, e o tema
  -- escuro continua valendo quando alguém trocar a cor pelo cadastro
  cor text not null default 'cinza',
  criado_em timestamptz not null default now()
);

create table if not exists public.kanban_cartoes (
  id uuid primary key default gen_random_uuid(),
  coluna_id uuid not null references public.kanban_colunas(id) on delete restrict,
  titulo text not null,
  descricao text,
  responsavel text,
  -- posição dentro da coluna; arrastar reescreve isto
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists ix_kanban_cartoes_coluna on public.kanban_cartoes (coluna_id, ordem);

drop trigger if exists t_kanban_upd on public.kanban_cartoes;
create trigger t_kanban_upd before update on public.kanban_cartoes
  for each row execute function public.trg_atualizado_em();

-- Mesmo fechamento das demais tabelas: o navegador nunca fala com o banco,
-- tudo passa pelas rotas /api com a service_role.
alter table public.kanban_colunas enable row level security;
alter table public.kanban_cartoes enable row level security;
revoke all on public.kanban_colunas from anon, authenticated;
revoke all on public.kanban_cartoes from anon, authenticated;

insert into public.kanban_colunas (nome, ordem, cor)
select * from (values
  ('Em análise',         1, 'azul'),
  ('Tranquilo resolver', 2, 'verde'),
  ('Crítico',            3, 'vermelho'),
  ('Resolvido',          4, 'cinza')
) as v(nome, ordem, cor)
where not exists (select 1 from public.kanban_colunas);
