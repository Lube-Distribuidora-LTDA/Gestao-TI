-- ============================================================
-- 17. Status "Lançada no WinThor"
--
-- O passo depois de "Assinado e entregue": a nota da fatura foi lançada no
-- contas a pagar do WinThor (o Júlio acompanha pela Rotina 750). Quem marca é o
-- agente que lê a PCLANC (etl/sync_winthor_750.py), não a tela.
--
-- Migração separada da 18 de propósito: valor novo de enum não pode ser usado na
-- mesma transação em que foi criado.
-- ============================================================

alter type public.status_fatura add value if not exists 'lancada_winthor' after 'entregue_contabilidade';
