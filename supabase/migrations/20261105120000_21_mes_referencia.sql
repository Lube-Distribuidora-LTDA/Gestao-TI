-- ============================================================
-- 21. Mês de referência da fatura
--
-- A competência é o mês em que o painel controla a fatura, e nem sempre é o mês
-- a que ela se refere: a Vivo de competência Nov/26 vence em 17/11 e cobra o
-- consumo de outubro. Por isso o mês de referência é um dado à parte:
--   * na conta, quantos meses antes da competência fica a referência
--     (0 = o próprio mês, 1 = o mês anterior) vale para todas as faturas dela;
--   * na fatura, mes_referencia corrige uma só, quando foge da regra.
-- A view entrega o mês final (mes_referencia) e o que a conta daria sozinha
-- (mes_referencia_conta), para a tela saber se a fatura tem correção própria.
-- ============================================================

alter table public.contas add column if not exists referencia_meses_antes smallint not null default 0;
alter table public.contas drop constraint if exists contas_referencia_meses_antes_check;
alter table public.contas add constraint contas_referencia_meses_antes_check check (referencia_meses_antes between 0 and 3);

alter table public.faturas add column if not exists mes_referencia date;
alter table public.faturas drop constraint if exists faturas_mes_referencia_dia_1;
alter table public.faturas add constraint faturas_mes_referencia_dia_1 check (mes_referencia is null or extract(day from mes_referencia) = 1);

-- colunas novas no FIM: create or replace view casa as existentes por posição
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
    f.winthor_recnum,
    (f.competencia - make_interval(months => c.referencia_meses_antes))::date AS mes_referencia_conta,
    COALESCE(f.mes_referencia, (f.competencia - make_interval(months => c.referencia_meses_antes))::date) AS mes_referencia
   FROM faturas f
     JOIN contas c ON c.id = f.conta_id
     JOIN fornecedores fo ON fo.id = c.fornecedor_id
     LEFT JOIN categorias_custo cat ON cat.id = c.categoria_id;
