-- ============================================================
-- 19. Código do fornecedor no WinThor (PCFORNEC.CODFORNEC)
--
-- Pedido do Júlio (2026-11-03): no cadastro de fornecedor, o campo "Cód. fornecedor" com o código do
-- WinThor, para ele achar o fornecedor direto na Rotina 750. Texto, não número: um fornecedor do painel
-- pode ser dois no WinThor (Mais Dados / INTELI+ = 10287 e 607508), separados por vírgula, como o CNPJ.
--
-- A função de casamento da Rotina 750 passa a aceitar o código também: o lançamento acha o fornecedor
-- pelo CNPJ ou pelo código (quem não tem CNPJ no painel, como a Vivo, entra pelo código).
-- ============================================================

alter table public.fornecedores add column if not exists cod_fornecedor_winthor text;
comment on column public.fornecedores.cod_fornecedor_winthor is
  'Código do fornecedor no WinThor (PCFORNEC.CODFORNEC), o que a Rotina 750 procura. Mais de um, separados por vírgula.';

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
  v_cod text;
  v_nota text;
  v_venc date;
  v_valor numeric;
  v_id uuid;
begin
  for l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) loop
    v_rec   := (l->>'recnum')::bigint;
    v_cnpj  := regexp_replace(coalesce(l->>'cnpj', ''), '\D', '', 'g');
    v_cod   := regexp_replace(coalesce(l->>'codfornec', ''), '\D', '', 'g');
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
         where ((v_cnpj <> '' and v_cnpj = any (regexp_split_to_array(regexp_replace(coalesce(fo.cnpj, ''), '[.\-/]', '', 'g'), '[^0-9]+')))
             or (v_cod <> '' and v_cod = any (regexp_split_to_array(coalesce(fo.cod_fornecedor_winthor, ''), '[^0-9]+'))))
           and f.status::text not in ('paga', 'cancelada', 'lancada_winthor')
           and f.winthor_recnum is null
      ) x
     where x.prioridade = 0
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
           numero_nota = coalesce(nullif(trim(f.numero_nota), ''), nullif(v_nota, ''))
     where f.id = v_id;

    recnum := v_rec; fatura_id := v_id; resultado := 'lancada'; return next;
  end loop;
end;
$$;

revoke all on function public.registrar_lancamentos_winthor(jsonb) from public, anon, authenticated;
grant execute on function public.registrar_lancamentos_winthor(jsonb) to service_role;
