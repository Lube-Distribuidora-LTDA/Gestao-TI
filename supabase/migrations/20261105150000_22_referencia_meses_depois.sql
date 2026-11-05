-- ============================================================
-- 22. Mês de referência também DEPOIS da competência
--
-- Referência é o mês de uso que se está pagando. Quem cobra adiantado paga o uso
-- do mês seguinte: o backup da INTELI+ vence 01/09 e diz "BACKUP: SETEMBRO/2026";
-- ChatGPT e Claude cobram em 24/10 o ciclo de 24/10 a 24/11, quase todo novembro.
-- referencia_meses_antes negativo = meses depois da competência (-1 = mês seguinte).
-- ============================================================

alter table public.contas drop constraint if exists contas_referencia_meses_antes_check;
alter table public.contas add constraint contas_referencia_meses_antes_check check (referencia_meses_antes between -3 and 3);

comment on column public.contas.referencia_meses_antes is
  'Mês de uso que a fatura paga, contado da competência: 1 = mês anterior, 0 = o mesmo, -1 = o seguinte (cobrança adiantada).';
