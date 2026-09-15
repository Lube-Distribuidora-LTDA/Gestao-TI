-- =====================================================
-- Migration 07: fechamento da superfície pública da API
--
-- O portal de chamados é aberto, então a anon key circula no navegador.
-- Toda leitura/escrita real acontece no servidor com a service_role; nada
-- deve ser alcançável com a chave pública.
-- =====================================================

-- ---------- 1. Views respeitam o RLS de quem consulta ----------
-- Sem isto, as views rodam como o dono (postgres) e entregam os dados das
-- tabelas base mesmo com RLS ativo.
alter view public.vw_faturas_detalhe      set (security_invoker = true);
alter view public.vw_custo_mensal         set (security_invoker = true);
alter view public.vw_custo_por_categoria  set (security_invoker = true);
alter view public.vw_custo_por_fornecedor set (security_invoker = true);
alter view public.vw_chamados_kpi         set (security_invoker = true);

-- ---------- 2. Chaves públicas não enxergam as views ----------
revoke all on public.vw_faturas_detalhe      from anon, authenticated;
revoke all on public.vw_custo_mensal         from anon, authenticated;
revoke all on public.vw_custo_por_categoria  from anon, authenticated;
revoke all on public.vw_custo_por_fornecedor from anon, authenticated;
revoke all on public.vw_chamados_kpi         from anon, authenticated;

-- ---------- 3. Funções sensíveis fora do alcance da API pública ----------
-- gerar_faturas_competencia cria registros financeiros: só o servidor chama.
revoke execute on function public.gerar_faturas_competencia(date) from anon, authenticated, public;
revoke execute on function public.gerar_protocolo()               from anon, authenticated, public;

-- as funções de trigger nunca devem ser chamadas como RPC
revoke execute on function public.trg_set_protocolo()   from anon, authenticated, public;
revoke execute on function public.trg_novo_usuario()    from anon, authenticated, public;
revoke execute on function public.trg_atualizado_em()   from anon, authenticated, public;

-- ---------- 4. search_path fixo nas funções ----------
-- Sem search_path fixo, um schema malicioso no caminho poderia sequestrar
-- as chamadas feitas dentro da função.
create or replace function public.trg_atualizado_em()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

revoke execute on function public.trg_atualizado_em() from anon, authenticated, public;

-- ---------- 5. Tabelas: nenhum privilégio para as chaves públicas ----------
-- RLS já bloqueia, mas retirar o GRANT é a segunda camada.
revoke all on public.fornecedores       from anon, authenticated;
revoke all on public.contas             from anon, authenticated;
revoke all on public.faturas            from anon, authenticated;
revoke all on public.documentos         from anon, authenticated;
revoke all on public.cobrancas          from anon, authenticated;
revoke all on public.categorias_custo   from anon, authenticated;
revoke all on public.chamados           from anon, authenticated;
revoke all on public.chamado_mensagens  from anon, authenticated;
revoke all on public.emails_processados from anon, authenticated;
revoke all on public.robo_execucoes     from anon, authenticated;
revoke all on public.ativos             from anon, authenticated;
revoke all on public.configuracoes      from anon, authenticated;
revoke all on public.perfis             from anon, authenticated;

-- a sequência de protocolo também não precisa ficar exposta
revoke all on sequence public.seq_protocolo_chamado from anon, authenticated;
;