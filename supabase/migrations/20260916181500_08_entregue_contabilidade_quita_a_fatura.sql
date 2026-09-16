-- ============================================================
-- 08. "Assinado e entregue" encerra a fatura, como "paga"
--
-- O status `entregue_contabilidade` foi criado direto no banco e nunca
-- chegou às migrations, então quem recriasse o banco a partir daqui não
-- o teria. Pior: a view continuou olhando só para 'paga', e uma fatura
-- assinada e entregue seguia marcada "(em atraso)" no painel depois da
-- data de vencimento — alarme falso justamente onde o alarme precisa ser
-- levado a sério.
--
-- A definição de `vw_faturas_detalhe` aqui é a que está em produção, e
-- não a da migration 03: a view foi redefinida no banco em algum ponto
-- (ganhou `valor_efetivo`, `precisa_revisao`, `exige_*`) e as migrations
-- ficaram para trás. Repetir a versão antiga desfaria essas colunas.
-- ============================================================

-- ---------- 1. o valor passa a existir no enum versionado ----------
do $$
begin
  if not exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'status_fatura'
       and e.enumlabel = 'entregue_contabilidade'
  ) then
    alter type status_fatura add value 'entregue_contabilidade';
  end if;
end$$;

/*
 * A view compara `status::text`, e não o enum.
 *
 * O Postgres recusa usar um valor de enum recém-criado na mesma transação
 * em que ele foi adicionado ("unsafe use of new value"). Como o `alter
 * type` acima está neste mesmo arquivo, comparar pelo texto é o que
 * garante que a migration rode tanto num banco novo quanto neste, onde o
 * valor já existia antes.
 */

-- ---------- 2. fatura encerrada não está "em atraso" ----------
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
       where d.fatura_id = f.id) as qtd_documentos
   from faturas f
     join contas c on c.id = f.conta_id
     join fornecedores fo on fo.id = c.fornecedor_id
     left join categorias_custo cat on cat.id = c.categoria_id;

-- ---------- 3. o robô passa a registrar reenvios ----------
-- Quando o fornecedor reencaminha à mão uma nota que já chegou pelo sistema
-- dele, o e-mail é registrado como `reenvio`: os anexos não são duplicados e
-- a fatura do primeiro envio permanece intacta.
comment on column public.emails_processados.resultado is
  'vinculado | reenvio | ignorado | sem_correspondencia | erro';
