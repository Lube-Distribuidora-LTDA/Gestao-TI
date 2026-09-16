-- ============================================================
-- 09. Canal de cobrança: e-mail ou WhatsApp
--
-- Nem todo fornecedor manda nota por e-mail. Alguns só respondem no
-- WhatsApp, e para esses a cobrança automática produz o pior resultado
-- possível: o e-mail sai, o contador de cobranças sobe, o painel dá a
-- conta por cobrada — e ninguém do outro lado leu nada.
--
-- O canal é do fornecedor, não da conta: quem atende por WhatsApp
-- atende assim para todos os contratos que tem com a gente.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'canal_cobranca') then
    create type canal_cobranca as enum ('email', 'whatsapp');
  end if;
end$$;

alter table public.fornecedores
  add column if not exists canal_cobranca canal_cobranca not null default 'email',
  add column if not exists whatsapp text;

comment on column public.fornecedores.canal_cobranca is
  'email = o robô cobra sozinho; whatsapp = a cobrança é feita à mão, pelo botão no painel';
comment on column public.fornecedores.whatsapp is
  'Número com DDD, só dígitos. O link wa.me é montado a partir daqui.';

/*
 * A tela de faturas precisa do canal para decidir, em cada linha, entre o
 * selo de documento e o botão de WhatsApp — sem uma segunda consulta por
 * linha.
 *
 * As duas colunas entram no fim da lista: `create or replace view` casa as
 * colunas por posição, e inserir no meio seria lido como tentativa de
 * renomear as seguintes.
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
      and f.status::text <> all (array['paga', 'entregue_contabilidade', 'cancelada']) as vencida,
    current_date - f.vencimento as dias_atraso,
    ( select count(*) as count
        from documentos d
       where d.fatura_id = f.id) as qtd_documentos,
    fo.canal_cobranca,
    fo.whatsapp as fornecedor_whatsapp
   from faturas f
     join contas c on c.id = f.conta_id
     join fornecedores fo on fo.id = c.fornecedor_id
     left join categorias_custo cat on cat.id = c.categoria_id;
