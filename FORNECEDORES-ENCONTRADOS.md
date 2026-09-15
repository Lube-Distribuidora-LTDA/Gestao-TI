# Fornecedores encontrados na caixa cpd@lube.com.br

Levantamento feito em 15/09/2026, varrendo os últimos 30 dias (775 e-mails) e
filtrando quem enviou anexo com cara de documento fiscal.

Use estes dados na tela **Fornecedores**. O campo que faz o robô funcionar é
**"E-mails que ele usa para enviar documentos"** — é por ele que o sistema
reconhece a nota quando ela chega.

---

## Cadastre estes

| Fornecedor | E-mails que ele usa para enviar | Categoria sugerida |
|---|---|---|
| **INTELI+ / Mais Dados** | `@maisdados.com.br` | Licenças de Software |
| **Print Solução** | `@printsolucao.com.br` | Segurança *(firewall)* |
| **Telefônica / Vivo** | `@telefonica.com, @vivo.com.br` | Telefonia |
| **Locaweb** | `@equipe.locaweb.com.br, @locaweb.com.br` | Nuvem e Hospedagem |
| **Kaizen Solutions** | `@kaizensolutions.com.br, @omie.com.br` | Licenças de Software |
| **Vix Suporte** | `@vixsuporte.com.br` | Manutenção e Suporte |
| **nstech (FUSION)** | `@nstech.com.br` | Licenças de Software |
| **Essencial Tech** | `@essencialtech.com.br` | Manutenção e Suporte |
| **Anthropic** | `@mail.anthropic.com` | Licenças de Software |

> **Kaizen Solutions** manda pelos dois endereços: a nota sai pelo Omie
> (`noreply@omie.com.br`) e o encaminhamento vem do financeiro deles. Por isso
> os dois domínios no mesmo cadastro.

O **e-mail de cobrança** (para onde a cobrança é enviada) precisa ser preenchido
por você — é o contato comercial de cada um, que não dá para deduzir dos
e-mails recebidos.

---

## ⚠️ NÃO cadastre estes — são golpe

Apareceram na mesma varredura, imitando fornecedores reais:

| Remetente | Finge ser | Por que é falso |
|---|---|---|
| `procuratraciol@tivois.store` | Vivo | domínio `.store` sem relação com a Vivo |
| `faturahapvida20637@hard.hapvidasaud.store` | Hapvida | domínio imitando o nome real |
| `enquiries@akscons.edu.ng` | AMIL | domínio de instituição de ensino na Nigéria |
| `planounimed98305@uni.medplano.store` | Unimed | domínio `.store` falsificado |
| `financeiro@coopersup.agr.br` | Locaweb | assina como Locaweb, domínio de cooperativa agrícola |

São boletos falsos — golpe comum no Brasil, em que o criminoso manda um boleto
com os dados do beneficiário trocados esperando que alguém pague sem conferir.

**Vale avisar o financeiro.** O sistema em si está protegido: o robô só aceita
documento de remetente que você cadastrou explicitamente, então nenhum desses
consegue dar baixa numa fatura ou entrar no painel.

---

## Como o cadastro reflete no robô

Depois de cadastrar o fornecedor, crie a **conta/contrato** dele com valor,
dia de vencimento e as regras de cobrança. Só então o robô tem a que vincular
os documentos: fornecedor → contrato → competência do mês.

Ordem: **Fornecedores → Contas → Faturas (botão "Abrir mês") → Robô**.
