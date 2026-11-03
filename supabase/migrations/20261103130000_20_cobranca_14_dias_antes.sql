-- ============================================================
-- 20. Cobrança começa 14 dias antes do vencimento
--
-- Pedido do Júlio (2026-11-03): "o robô rode automático e envie [a cobrança] todas as vezes que fizer
-- 2 semanas pra vencer". Era 5 dias (o padrão da tabela desde a criação); todas as contas passam a 14,
-- e o padrão de conta nova também. O intervalo entre cobranças (3 dias) e o máximo (4) não mudam.
-- ============================================================

alter table public.contas alter column dias_antes_vencimento set default 14;
update public.contas set dias_antes_vencimento = 14 where dias_antes_vencimento <> 14;
