-- ============================================================
-- 10. Recibo e pagamento automático
--
-- As assinaturas de IA (Claude, ChatGPT, Supabase, Google IA Pro) não
-- emitem nota fiscal nem boleto: são debitadas no cartão em data fixa e
-- o fornecedor manda só um recibo depois do fato.
--
-- O sistema inteiro presumia o contrário — que todo custo vence, é
-- cobrado e precisa de nota. Sem estas colunas, essas contas ficariam
-- para sempre "aguardando documentos", com alerta de atraso num dia que
-- já foi pago.
-- ============================================================

-- ---------- 1. o recibo é um tipo de documento de verdade ----------
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'tipo_documento' and e.enumlabel = 'recibo'
  ) then
    alter type tipo_documento add value 'recibo' before 'contrato';
  end if;
end$$;

-- ---------- 2. a conta diz o que espera e como é paga ----------
alter table public.contas
  add column if not exists exige_recibo boolean not null default false,
  add column if not exists pagamento_automatico boolean not null default false;

comment on column public.contas.exige_recibo is
  'Conta que se encerra com recibo, não com nota fiscal (assinaturas de software no exterior)';
comment on column public.contas.pagamento_automatico is
  'Débito automático em data fixa: a data da fatura é o dia do pagamento, não um vencimento a acompanhar';

-- ---------- 3. débito automático nunca fica "em atraso" ----------
/*
 * A data de uma conta de débito automático é o dia em que o dinheiro sai,
 * não um prazo a cumprir. Sem esta exceção, toda assinatura de IA ficaria
 * vermelha no dia seguinte ao pagamento, todo mês — e alarme que sempre
 * toca ninguém mais escuta.
 *
 * As colunas novas entram no fim: `create or replace view` casa por posição.
 */
create or replace view public.vw_faturas_detalhe as
 select f.id,
    f.competencia,
    f.vencimento,
    f.status,
    f.valor_previsto,
    f.valor_real,
    coalesce(f.valor_real, f.valor_previsto) as valor_efetivo,
    f.nota_fiscal_recebida_em,
    f.fatura_recebida_em,
    f.pago_em,
    f.numero_nota,
    f.cobrancas_enviadas,
    f.ultima_cobranca_em,
    f.precisa_revisao,
    f.observacoes,
    c.id as conta_id,
    c.descricao as conta_descricao,
    c.identificador,
    c.exige_nota_fiscal,
    c.exige_fatura,
    c.cobranca_ativa,
    c.dias_antes_vencimento,
    c.intervalo_cobranca_dias,
    c.max_cobrancas,
    c.centro_custo,
    fo.id as fornecedor_id,
    fo.nome as fornecedor_nome,
    fo.email_cobranca,
    cat.id as categoria_id,
    cat.nome as categoria_nome,
    cat.cor as categoria_cor,
    f.vencimento < current_date
      and f.status::text <> all (array['paga', 'entregue_contabilidade', 'cancelada'])
      and not c.pagamento_automatico as vencida,
    current_date - f.vencimento as dias_atraso,
    ( select count(*) as count
        from documentos d
       where d.fatura_id = f.id) as qtd_documentos,
    fo.canal_cobranca,
    fo.whatsapp as fornecedor_whatsapp,
    c.exige_recibo,
    c.pagamento_automatico
   from faturas f
     join contas c on c.id = f.conta_id
     join fornecedores fo on fo.id = c.fornecedor_id
     left join categorias_custo cat on cat.id = c.categoria_id;
