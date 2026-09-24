-- ============================================================
-- 11. Documento via link de portal (SAAM/ContaAzul)
--
-- Alguns fornecedores não mandam nota nem boleto em anexo: mandam um link
-- de portal onde os dois documentos ficam disponíveis para consulta e
-- pagamento — é o caso da SAAM, desde que trocou de Omie para ContaAzul.
-- Tratar isso como "e-mail sem anexo", que era o comportamento até aqui,
-- descartava a cobrança inteira em silêncio, mês após mês.
-- ============================================================

-- ---------- 1. novo tipo de documento ----------
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'tipo_documento' and e.enumlabel = 'link_portal'
  ) then
    alter type tipo_documento add value 'link_portal';
  end if;
end$$;

-- ---------- 2. a conta diz que o documento dela chega como link ----------
alter table public.contas
  add column if not exists documento_via_link boolean not null default false;

comment on column public.contas.documento_via_link is
  'O fornecedor manda nota/boleto como link de portal, não anexo (ex.: SAAM via ContaAzul). O robô extrai o link do corpo do e-mail em vez de procurar PDF/XML.';

-- ---------- 3. o documento de link guarda a URL, não um arquivo ----------
alter table public.documentos
  add column if not exists url_externa text;

comment on column public.documentos.url_externa is
  'Para tipo=link_portal: a URL do portal do fornecedor. storage_path fica nulo nesse caso.';

-- ---------- 4. a tela de faturas precisa do sinalizador por linha ----------
-- A coluna nova entra no fim: `create or replace view` casa por posição, e
-- inserir no meio seria lido como tentativa de renomear as colunas seguintes.
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
    c.pagamento_automatico,
    c.documento_via_link
   from faturas f
     join contas c on c.id = f.conta_id
     join fornecedores fo on fo.id = c.fornecedor_id
     left join categorias_custo cat on cat.id = c.categoria_id;

-- ---------- 5. cadastro da SAAM ----------
-- A palavra-chave da conta tinha virado uma URL inteira (inútil para casar
-- e-mail nenhum, sobra de um teste anterior). E a razão social ganha
-- "SISAUDCON" — é o nome com que o ContaAzul se refere à SAAM na maioria dos
-- avisos, e sem isso o robô não teria como confirmar a quem o link pertence.
update public.contas set
  documento_via_link = true,
  palavras_chave = array['saam', 'sisaudcon']
 where id = (
   select c.id from public.contas c
     join public.fornecedores f on f.id = c.fornecedor_id
    where f.nome = 'SAAM'
 );

update public.fornecedores set
  razao_social = 'SISAUDCON',
  emails_remetentes = array['@saamauditoria.com.br', '@contaazul.com']
 where nome = 'SAAM';
