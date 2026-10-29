# Agente da Rotina 750 — GESTÃO TI

De hora em hora (07:25 às 19:25) lê no WinThor os lançamentos de contas a pagar (PCLANC — o que a
Rotina 750 mostra) dos fornecedores de TI e marca a fatura correspondente no painel como
**Lançada no WinThor**. Só lê o WinThor. Cada rodada aparece na tela **Robô** do painel.

## Instalar (uma vez, e de novo a cada mudança nos scripts)

1. Nesta pasta (`P:\INTEGRAÇÃO BI\GESTAO TI`), copie `ENV.example` para um arquivo chamado `ENV`
   (sem extensão) e preencha:
   - as cinco linhas `ORACLE_` — iguais às do `ENV` dos BIs;
   - `GESTAO_TI_SUPABASE_URL` e `GESTAO_TI_SERVICE_ROLE_KEY` — Supabase do projeto **gestao-ti**,
     *Settings › API* (a chave `service_role`, que é secreta).
2. Rode, numa janela do PowerShell nesta pasta:

   ```
   powershell -ExecutionPolicy Bypass -File .\instalar_e_agendar.ps1
   ```

   Ele copia tudo para `C:\BI\GESTAO_TI`, pede administrador, testa o modo de agendamento com uma
   tarefa-cobaia, cria a tarefa **Gestao TI - Rotina 750** e dispara uma rodada para provar.

## Como a fatura é achada

Pelo CNPJ do fornecedor (cadastro de Fornecedores no painel) e, nesta ordem: o **número da nota**;
ou, se a fatura ainda não tem número, **vencimento a até 5 dias e valor a até 1%**. A regra mora na
função `registrar_lancamentos_winthor` do banco (migração 18). Rodar de novo não duplica nada.

Fornecedor sem CNPJ no painel não é procurado no WinThor.

## Conferir

- Tela **Robô** do painel: "Lançamentos no WinThor (Rotina 750)".
- `C:\BI\GESTAO_TI\sync_winthor_750.log`; se a tarefa "rodou" e nada aconteceu, `falha_inicial.log`.
- Simular sem gravar: `python sync_winthor_750.py --simular`.
