-- ============================================================
-- 15. Fornecedor inativo sai do painel
--
-- Marcar o fornecedor como inativo é como se encerra um contrato aqui, mas
-- nada no sistema reparava nisso: a Data R Informática estava inativa e
-- mesmo assim tinha fatura de outubro no painel, porque tanto a geração de
-- competências quanto a listagem olhavam apenas `contas.ativo` — e a conta
-- tinha ficado ativa.
--
-- Duas mudanças:
--   1. a view expõe `fornecedor_ativo` e `conta_ativa`, para a tela poder
--      filtrar. As colunas entram no FIM: `create or replace view` casa por
--      posição, e inserir no meio seria lido como renomear as seguintes;
--   2. a geração deixa de abrir competência para fornecedor inativo.
-- ============================================================

create or replace view public.vw_faturas_detalhe as
 SELECT f.id,
    f.competencia,
    f.vencimento,
    f.status,
    f.valor_previsto,
    f.valor_real,
    COALESCE(f.valor_real, f.valor_previsto) AS valor_efetivo,
    f.nota_fiscal_recebida_em,
    f.fatura_recebida_em,
    f.pago_em,
    f.numero_nota,
    f.cobrancas_enviadas,
    f.ultima_cobranca_em,
    f.precisa_revisao,
    f.observacoes,
    c.id AS conta_id,
    c.descricao AS conta_descricao,
    c.identificador,
    c.exige_nota_fiscal,
    c.exige_fatura,
    c.cobranca_ativa,
    c.dias_antes_vencimento,
    c.intervalo_cobranca_dias,
    c.max_cobrancas,
    c.centro_custo,
    fo.id AS fornecedor_id,
    fo.nome AS fornecedor_nome,
    fo.email_cobranca,
    cat.id AS categoria_id,
    cat.nome AS categoria_nome,
    cat.cor AS categoria_cor,
    f.vencimento < CURRENT_DATE AND (f.status::text <> ALL (ARRAY['paga'::text, 'entregue_contabilidade'::text, 'cancelada'::text])) AND NOT c.pagamento_automatico AS vencida,
    CURRENT_DATE - f.vencimento AS dias_atraso,
    ( SELECT count(*) AS count
           FROM documentos d
          WHERE d.fatura_id = f.id) AS qtd_documentos,
    fo.canal_cobranca,
    fo.whatsapp AS fornecedor_whatsapp,
    c.exige_recibo,
    c.pagamento_automatico,
    c.documento_via_link,
    fo.ativo AS fornecedor_ativo,
    c.ativo AS conta_ativa
   FROM faturas f
     JOIN contas c ON c.id = f.conta_id
     JOIN fornecedores fo ON fo.id = c.fornecedor_id
     LEFT JOIN categorias_custo cat ON cat.id = c.categoria_id;

alter view public.vw_faturas_detalhe set (security_invoker = true);
revoke all on public.vw_faturas_detalhe from anon, authenticated;

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
      join public.fornecedores fo on fo.id = c.fornecedor_id
    where c.ativo = true
      and fo.ativo = true
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
