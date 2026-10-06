-- ============================================================
-- 13. A competência nova respeita a distância da própria conta
--
-- Com a 12 consertando o null, a geração voltou a rodar — e criou 22 faturas
-- de outubro, das quais 8 com a data errada. A função calculava o vencimento
-- sempre dentro do mês da competência, mas isso só vale para parte das contas:
--
--   SAAM, Vivo, DMS Fusion, assinaturas  -> vencem no mês da competência
--   Vix, Kaizen, Print Solução, INTELI+  -> vencem no mês seguinte
--
-- Para as do segundo grupo, a competência de outubro nasceu com a data da de
-- setembro — que é a que vence agora. As duas apareciam lado a lado no painel,
-- mesmo fornecedor, mesmo valor, mesma data: uma já assinada e entregue, a
-- outra aguardando documentos. Parecia duplicata, e na prática era: a mesma
-- conta do mundo real contada duas vezes.
--
-- Agora a distância sai do histórico da própria conta, a mesma regra que o
-- robô usa ao abrir competência pelo documento que chega (src/lib/robo.ts).
-- Sem histórico, ou com histórico torto, mantém o comportamento antigo.
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
  v_base date;
  v_dia int;
  v_off int;
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

    select round(avg( (extract(year from f.vencimento) - extract(year from f.competencia)) * 12
                    + (extract(month from f.vencimento) - extract(month from f.competencia)) ))::int
      into v_off
      from public.faturas f
     where f.conta_id = r.id and f.competencia < v_comp;

    if v_off is null or v_off < 0 or v_off > 2 then
      v_off := 0;
    end if;

    v_base := (v_comp + (v_off || ' month')::interval)::date;

    v_dia := least(
               coalesce(r.dia_vencimento, 10),
               extract(day from (v_base + interval '1 month - 1 day'))::int
             );
    v_venc := v_base + (v_dia - 1);

    insert into public.faturas (conta_id, competencia, vencimento, valor_previsto, status)
    values (r.id, v_comp, v_venc, r.valor_previsto, 'aguardando_documentos');

    v_criadas := v_criadas + 1;
  end loop;

  return query select v_criadas, v_existentes;
end;
$function$;
