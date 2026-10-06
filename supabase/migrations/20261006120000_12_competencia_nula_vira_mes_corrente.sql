-- ============================================================
-- 12. gerar_faturas_competencia aceita competência nula
--
-- Nenhuma competência foi aberta desde que o sistema entrou no ar: em
-- 06/10/2026 havia 26 contas ativas e 4 faturas de outubro, e essas quatro
-- tinham sido criadas pelo robô ao receber documento, não pelo agendamento.
--
-- A causa é a diferença entre "não passar o parâmetro" e "passar null". O
-- DEFAULT da função só vale quando o argumento é omitido; as três rotas que a
-- chamam mandam `p_competencia: null` explicitamente, o que sobrescreve o
-- padrão. Daí `date_trunc('month', null)` = null, a checagem de existência
-- nunca casa (`competencia = null` não é verdadeiro para ninguém) e o insert
-- bate na restrição NOT NULL de faturas.competencia.
--
-- O erro existia todo dia e não aparecia em lugar nenhum, porque a rota de
-- cobrança tinha um `catch` vazio em volta desta chamada.
--
-- Corrigir aqui, e não nos chamadores, resolve os três de uma vez — inclusive
-- o botão de gerar competências do painel, que tem o mesmo defeito.
-- ============================================================

create or replace function public.gerar_faturas_competencia(
  p_competencia date default (date_trunc('month', current_date))::date
)
returns table(criadas integer, existentes integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_criadas int := 0;
  v_existentes int := 0;
  r record;
  v_venc date;
  v_dia int;
  -- coalesce: "null" aqui quer dizer "o mês corrente", que é o que todo
  -- chamador quer dizer ao não escolher uma competência
  v_comp date := date_trunc('month', coalesce(p_competencia, current_date))::date;
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
$function$;
