-- =====================================================
-- Migration 03: Triggers, views analiticas, RLS, storage
-- =====================================================

-- ---------- TRIGGER GENERICO atualizado_em ----------
create or replace function public.trg_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger t_forn_upd   before update on public.fornecedores for each row execute function public.trg_atualizado_em();
create trigger t_contas_upd before update on public.contas       for each row execute function public.trg_atualizado_em();
create trigger t_fat_upd    before update on public.faturas      for each row execute function public.trg_atualizado_em();
create trigger t_cham_upd   before update on public.chamados     for each row execute function public.trg_atualizado_em();
create trigger t_ativos_upd before update on public.ativos       for each row execute function public.trg_atualizado_em();

-- ---------- GERACAO AUTOMATICA DE FATURAS DO MES ----------
create or replace function public.gerar_faturas_competencia(p_competencia date default date_trunc('month', current_date)::date)
returns table (criadas int, existentes int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_criadas int := 0;
  v_existentes int := 0;
  r record;
  v_venc date;
  v_dia int;
  v_comp date := date_trunc('month', p_competencia)::date;
begin
  for r in
    select c.* from public.contas c
    where c.ativo = true
      and (
        c.periodicidade = 'mensal'
        or (c.periodicidade = 'bimestral'  and (extract(month from v_comp)::int % 2) = 1)
        or (c.periodicidade = 'trimestral' and (extract(month from v_comp)::int % 3) = 1)
        or (c.periodicidade = 'semestral'  and (extract(month from v_comp)::int % 6) = 1)
        or (c.periodicidade = 'anual'      and  extract(month from v_comp)::int = 1)
      )
  loop
    if exists (select 1 from public.faturas f where f.conta_id = r.id and f.competencia = v_comp) then
      v_existentes := v_existentes + 1;
      continue;
    end if;

    -- protege contra dia 31 em mes de 30 dias
    v_dia := coalesce(r.dia_vencimento, 10);
    v_venc := v_comp + (least(
                v_dia,
                extract(day from (v_comp + interval '1 month - 1 day'))::int
              ) - 1) * interval '1 day';

    insert into public.faturas (conta_id, competencia, vencimento, valor_previsto, status)
    values (r.id, v_comp, v_venc, r.valor_previsto, 'aguardando_documentos');

    v_criadas := v_criadas + 1;
  end loop;

  return query select v_criadas, v_existentes;
end;
$$;

-- ---------- VIEWS ANALITICAS ----------

create or replace view public.vw_faturas_detalhe as
select
  f.id,
  f.competencia,
  f.vencimento,
  f.status,
  f.valor_previsto,
  f.valor_real,
  coalesce(f.valor_real, f.valor_previsto)         as valor_efetivo,
  f.nota_fiscal_recebida_em,
  f.fatura_recebida_em,
  f.pago_em,
  f.numero_nota,
  f.cobrancas_enviadas,
  f.ultima_cobranca_em,
  c.id            as conta_id,
  c.descricao     as conta_descricao,
  c.identificador,
  c.exige_nota_fiscal,
  c.exige_fatura,
  c.cobranca_ativa,
  c.dias_antes_vencimento,
  c.intervalo_cobranca_dias,
  c.max_cobrancas,
  c.centro_custo,
  fo.id           as fornecedor_id,
  fo.nome         as fornecedor_nome,
  fo.email_cobranca,
  cat.id          as categoria_id,
  cat.nome        as categoria_nome,
  cat.cor         as categoria_cor,
  (f.vencimento < current_date and f.status not in ('paga','cancelada')) as vencida,
  (current_date - f.vencimento)                    as dias_atraso,
  (select count(*) from public.documentos d where d.fatura_id = f.id) as qtd_documentos
from public.faturas f
join public.contas c        on c.id = f.conta_id
join public.fornecedores fo on fo.id = c.fornecedor_id
left join public.categorias_custo cat on cat.id = c.categoria_id;

create or replace view public.vw_custo_mensal as
select
  f.competencia,
  to_char(f.competencia, 'MM/YYYY')                as competencia_label,
  sum(coalesce(f.valor_real, f.valor_previsto))    as total,
  sum(f.valor_previsto)                            as total_previsto,
  sum(coalesce(f.valor_real,0))                    as total_real,
  count(*)                                         as qtd_faturas,
  count(*) filter (where f.status = 'paga')        as qtd_pagas,
  sum(coalesce(f.valor_real, f.valor_previsto)) filter (where f.status = 'paga') as total_pago
from public.faturas f
where f.status <> 'cancelada'
group by f.competencia;

create or replace view public.vw_custo_por_categoria as
select
  coalesce(cat.id::text, 'sem-categoria')          as categoria_id,
  coalesce(cat.nome, 'Sem categoria')              as categoria_nome,
  coalesce(cat.cor, '#64748B')                     as cor,
  f.competencia,
  sum(coalesce(f.valor_real, f.valor_previsto))    as total,
  count(*)                                         as qtd
from public.faturas f
join public.contas c on c.id = f.conta_id
left join public.categorias_custo cat on cat.id = c.categoria_id
where f.status <> 'cancelada'
group by 1,2,3,4;

create or replace view public.vw_custo_por_fornecedor as
select
  fo.id      as fornecedor_id,
  fo.nome    as fornecedor_nome,
  f.competencia,
  sum(coalesce(f.valor_real, f.valor_previsto)) as total,
  count(*)   as qtd_faturas
from public.faturas f
join public.contas c        on c.id = f.conta_id
join public.fornecedores fo on fo.id = c.fornecedor_id
where f.status <> 'cancelada'
group by 1,2,3;

create or replace view public.vw_chamados_kpi as
select
  count(*)                                                   as total,
  count(*) filter (where status = 'aberto')                  as abertos,
  count(*) filter (where status = 'em_atendimento')          as em_atendimento,
  count(*) filter (where status = 'aguardando_usuario')      as aguardando_usuario,
  count(*) filter (where status in ('resolvido','fechado'))  as resolvidos,
  count(*) filter (where prioridade = 'critica'
                     and status not in ('resolvido','fechado','cancelado')) as criticos_abertos,
  avg(extract(epoch from (resolvido_em - aberto_em))/3600)
    filter (where resolvido_em is not null)                  as horas_medias_resolucao,
  avg(avaliacao) filter (where avaliacao is not null)        as avaliacao_media
from public.chamados;

-- ---------- RLS: bloqueio total para chaves publicas ----------
-- Toda a aplicacao acessa o banco pelo servidor (service_role, que ignora RLS).
-- Nenhuma policy e criada de proposito: a anon key nao le nem escreve nada.
alter table public.categorias_custo   enable row level security;
alter table public.fornecedores       enable row level security;
alter table public.contas             enable row level security;
alter table public.faturas            enable row level security;
alter table public.documentos         enable row level security;
alter table public.cobrancas          enable row level security;
alter table public.chamados           enable row level security;
alter table public.chamado_mensagens  enable row level security;
alter table public.emails_processados enable row level security;
alter table public.robo_execucoes     enable row level security;
alter table public.ativos             enable row level security;
alter table public.configuracoes      enable row level security;

-- ---------- STORAGE ----------
insert into storage.buckets (id, name, public)
values ('documentos-ti', 'documentos-ti', false)
on conflict (id) do nothing;
;