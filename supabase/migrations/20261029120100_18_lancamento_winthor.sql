-- ============================================================
-- 18. Lançamento da nota no WinThor (Rotina 750)
--
-- O agente etl/sync_winthor_750.py lê a PCLANC (contas a pagar do WinThor) dos
-- fornecedores de TI e manda os lançamentos para registrar_lancamentos_winthor(),
-- que acha a fatura de cada um e a marca como "Lançada no WinThor".
--
-- A regra de casamento mora aqui, no banco, e não no script: um lugar só para
-- conferir e corrigir.
-- ============================================================

-- o lançamento que confirmou a fatura, como veio do WinThor
alter table public.faturas add column if not exists winthor_recnum bigint;
alter table public.faturas add column if not exists winthor_lancado_em date;
alter table public.faturas add column if not exists winthor_valor numeric(12,2);
alter table public.faturas add column if not exists winthor_vencimento date;
alter table public.faturas add column if not exists winthor_conferido_em timestamptz;

-- um lançamento confirma uma fatura só
create unique index if not exists ux_faturas_winthor_recnum on public.faturas (winthor_recnum) where winthor_recnum is not null;

-- A view: "lançada no WinThor" não é atraso (como "entregue"), e as colunas novas
-- entram no FIM — create or replace view não aceita mudar a ordem das existentes.
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
    f.vencimento < CURRENT_DATE
      AND (f.status::text <> ALL (ARRAY['paga'::text, 'entregue_contabilidade'::text, 'lancada_winthor'::text, 'cancelada'::text]))
      AND NOT c.pagamento_automatico AS vencida,
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
    c.ativo AS conta_ativa,
    f.winthor_lancado_em,
    f.winthor_valor,
    f.winthor_recnum
   FROM faturas f
     JOIN contas c ON c.id = f.conta_id
     JOIN fornecedores fo ON fo.id = c.fornecedor_id
     LEFT JOIN categorias_custo cat ON cat.id = c.categoria_id;

/*
 * Recebe os lançamentos da PCLANC como jsonb:
 *   [{recnum, cnpj, numnota, dtlanc, dtvenc, valor}, ...]
 * e devolve o que aconteceu com cada um.
 *
 * Casamento, nesta ordem:
 *   1. mesmo CNPJ e mesmo número de nota (sem zeros à esquerda);
 *   2. mesmo CNPJ, vencimento a até 5 dias e valor a até 1% (ou 5 centavos), e só
 *      se a fatura ainda não tem outro número de nota.
 * Entre as candidatas, fica a de vencimento mais próximo. O CNPJ do fornecedor
 * pode ter mais de um (Mais Dados / INTELI+), separados por vírgula.
 *
 * Fatura paga, cancelada ou já lançada não é tocada; o mesmo lançamento nunca
 * confirma duas faturas (índice único em winthor_recnum).
 */
create or replace function public.registrar_lancamentos_winthor(p_lancamentos jsonb)
returns table(recnum bigint, fatura_id uuid, resultado text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  l jsonb;
  v_rec bigint;
  v_cnpj text;
  v_nota text;
  v_venc date;
  v_valor numeric;
  v_id uuid;
begin
  for l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) loop
    v_rec   := (l->>'recnum')::bigint;
    v_cnpj  := regexp_replace(coalesce(l->>'cnpj', ''), '\D', '', 'g');
    v_nota  := ltrim(regexp_replace(coalesce(l->>'numnota', ''), '\D', '', 'g'), '0');
    v_venc  := (l->>'dtvenc')::date;
    v_valor := (l->>'valor')::numeric;
    v_id    := null;

    select f.id into v_id from faturas f where f.winthor_recnum = v_rec limit 1;
    if v_id is not null then
      recnum := v_rec; fatura_id := v_id; resultado := 'ja_registrado'; return next;
      continue;
    end if;

    select x.id into v_id
      from (
        select f.id,
               case when v_nota <> ''
                     and ltrim(regexp_replace(coalesce(f.numero_nota, ''), '\D', '', 'g'), '0') = v_nota
                    then 0 else 1 end as prioridade,
               ltrim(regexp_replace(coalesce(f.numero_nota, ''), '\D', '', 'g'), '0') as nota,
               abs(f.vencimento - v_venc) as distancia,
               coalesce(f.valor_real, f.valor_previsto) as valor
          from faturas f
          join contas c on c.id = f.conta_id
          join fornecedores fo on fo.id = c.fornecedor_id
         where v_cnpj = any (regexp_split_to_array(regexp_replace(coalesce(fo.cnpj, ''), '[.\-/]', '', 'g'), '[^0-9]+'))
           and f.status::text not in ('paga', 'cancelada', 'lancada_winthor')
           and f.winthor_recnum is null
      ) x
     where x.prioridade = 0
        -- por vencimento e valor só quando a fatura ainda não tem outro número de nota
        or (x.nota = '' and x.distancia <= 5 and abs(x.valor - v_valor) <= greatest(0.05, v_valor * 0.01))
     order by x.prioridade, x.distancia
     limit 1;

    if v_id is null then
      recnum := v_rec; fatura_id := null; resultado := 'sem_fatura'; return next;
      continue;
    end if;

    update faturas f
       set status = 'lancada_winthor',
           winthor_recnum = v_rec,
           winthor_lancado_em = (l->>'dtlanc')::date,
           winthor_valor = v_valor,
           winthor_vencimento = v_venc,
           winthor_conferido_em = now(),
           -- fatura sem número de nota ganha o do WinThor (Conectja e Locaweb chegavam sem)
           numero_nota = coalesce(nullif(trim(f.numero_nota), ''), nullif(v_nota, ''))
     where f.id = v_id;

    recnum := v_rec; fatura_id := v_id; resultado := 'lancada'; return next;
  end loop;
end;
$$;

-- só a service_role (o agente, pela API do Supabase) chama
revoke all on function public.registrar_lancamentos_winthor(jsonb) from public, anon, authenticated;
grant execute on function public.registrar_lancamentos_winthor(jsonb) to service_role;
