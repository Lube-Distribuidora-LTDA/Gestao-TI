# Gestão de TI — Lube Distribuidora

Sistema de controle do departamento de TI: contas e contratos, cobrança automática
de notas fiscais por e-mail, dashboard de custos, portal de chamados e inventário.

---

## 1. O que o sistema faz

### Controle financeiro
- Cadastro de **fornecedores**, **contas/contratos** e **categorias de custo**
- Abertura automática das **competências** (uma fatura por conta, por mês)
- Marcação de nota fiscal / fatura recebidas, valor real e baixa de pagamento
- **Dashboard** com evolução mensal, custo por categoria e por fornecedor

### Robô de e-mail (o coração do sistema)
1. Conecta no webmail da Locaweb por **IMAP** e lê os e-mails recentes
2. Reconhece o remetente e liga ao **fornecedor** cadastrado
3. Descobre a qual **contrato** e **competência** o e-mail se refere
4. Baixa os anexos (PDF/XML), classifica em nota fiscal / fatura / boleto
5. **Baixa a pendência automaticamente** no painel
6. Quem não enviou dentro da janela recebe um **e-mail formal de cobrança**,
   com tom que sobe a cada tentativa

O robô **nunca processa o mesmo e-mail duas vezes** (controle por `message_id`) e
**não marca nada como lido** — sua caixa continua como estava.

### Chamados
- Portal público em `/abrir-chamado` — sem login, qualquer setor acessa pelo link
- Protocolo automático (`TI-2026-00001`) e e-mail de confirmação
- Painel de atendimento com conversa, anotações internas e prioridades
- O solicitante acompanha por um **link com token**, responde e avalia o atendimento
- Toda resposta da TI sai por e-mail automaticamente

### Inventário
- Equipamentos com patrimônio, usuário, setor, garantia e valor

---

## 2. Como colocar no ar

### 2.1 Preencher o `.env.local`

Abra o arquivo `.env.local` na raiz do projeto e preencha os **três campos vazios**:

| Variável | Onde pegar |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → projeto **GESTAO TI** → Project Settings → API Keys → `service_role` |
| `IMAP_PASS` | senha da caixa `cpd@lube.com.br` |
| `SMTP_PASS` | a mesma senha |

> A `service_role` ignora todas as regras de segurança do banco. Ela só existe no
> servidor — nunca é enviada ao navegador e nunca deve ser publicada.

**Hosts da Locaweb** (confirmados em 15/09/2026):

```
IMAP_HOST=email-ssl.com.br
SMTP_HOST=email-ssl.com.br
```

> Não use `imap.lube.com.br` nem `smtp.lube.com.br`: o certificado do servidor é
> `*.email-ssl.com.br` e a validação TLS falha. A alternativa seria desligar a
> verificação do certificado, o que exporia a senha do e-mail a interceptação.

### 2.2 Rodar localmente

```bash
npm run dev
```

Acesse `http://localhost:3000` → a tela de login avisa que é o primeiro acesso →
clique em **Criar o administrador** e defina sua senha.

### 2.3 Testar as conexões

Entre em **Robô de e-mail** e use os botões **Testar IMAP** e **Testar SMTP**.
Só siga adiante quando os dois derem OK — é aqui que erro de host ou senha aparece.

### 2.4 Publicar na Vercel

O projeto **gestao-ti** já está criado e ligado a este repositório
(time `LUBE DISTRIBUIDORA LTDA`), então todo push na branch `main` publica
sozinho. Falta só cadastrar as variáveis de ambiente, uma única vez:

```bash
npx vercel login
npx vercel link
node scripts/configurar-vercel.mjs
```

O script lê o `.env.local` e cadastra tudo nos três ambientes, sem imprimir
nenhum valor na tela. Ele já troca o `NEXT_PUBLIC_APP_URL` para o domínio de
produção — sem isso os links dos e-mails apontariam para `localhost`.

Se o domínio final for diferente de `https://gestao-ti-lube-distribuidora-ltda.vercel.app`:

```bash
URL_PRODUCAO=https://seu-dominio.vercel.app node scripts/configurar-vercel.mjs
```

Depois, publique:

```bash
npx vercel --prod
```

---

## 3. Ordem de cadastro (primeira vez)

1. **Fornecedores** — quem emite as notas
   - `E-mail de cobrança`: para onde a cobrança é enviada
   - `E-mails que ele usa para enviar`: aceita `@dominio.com.br` para pegar
     qualquer remetente daquele domínio — **é isso que ensina o robô**
2. **Contas e contratos** — o que se paga, quanto, dia do vencimento e as regras
   de cobrança (quantos dias antes, intervalo, máximo de tentativas)
3. **Faturas** → botão **Abrir mês** — gera as competências do mês corrente
4. **Robô** → **Ler webmail agora** para o primeiro teste

---

## 4. Automações agendadas (Vercel Cron)

O plano **Hobby** permite 2 agendamentos, 1 execução diária cada, e limita as
funções a 60 segundos. O `vercel.json` já está ajustado para isso:

| Tarefa | Quando | Horário de Brasília |
|---|---|---|
| Ler webmail e vincular documentos | `0 11 * * *` | 8h |
| Abrir competências + cobrar fornecedores | `0 12 * * *` | 9h |

A abertura das competências do mês foi embutida na rotina de cobrança, já que
sobraram só dois agendamentos. A função no banco é idempotente: rodar todo dia
não duplica nada, ela ignora as competências que já existem.

Migrando para o plano Pro, dá para separar de novo e aumentar a frequência da
leitura (4x ao dia é confortável).

As rotas `/api/cron/*` são protegidas pelo `CRON_SECRET` — a Vercel envia esse
segredo automaticamente. Para rodar à mão:

```bash
curl "https://SEU-APP.vercel.app/api/cron/ler-emails?secret=SEU_CRON_SECRET"
```

Tudo também pode ser executado pelo painel, em **Robô de e-mail**, sem depender
do agendador.

### Desempenho da varredura

A caixa `cpd@lube.com.br` tem ~88 mil mensagens e recebe cerca de 50 por dia, o
que torna inviável baixar tudo. A leitura acontece em três fases:

1. o servidor IMAP devolve só os UIDs de quem veio de fornecedor cadastrado;
2. a estrutura da mensagem diz quais trazem anexo de documento;
3. só então o corpo é baixado.

Medido em produção: **2,1 segundos** para a triagem completa de 7 dias — bem
dentro dos 60s do plano Hobby.

## 5. Decisões de segurança

- **O navegador nunca fala com o banco.** Toda leitura e escrita passa pelas rotas
  `/api` deste projeto, que rodam no servidor e aplicam as regras de acesso.
- **RLS ativo sem policy em todas as tabelas**, e os privilégios de `anon` e
  `authenticated` foram revogados. Se a chave pública vazar, ela não lê nada.
- As **views** usam `security_invoker` e não são acessíveis pela API pública.
- **Senhas não ficam no banco nem no navegador** — só em variáveis de ambiente.
- O **CRUD genérico** aceita apenas tabelas e colunas de uma whitelist
  (`src/lib/crud-config.ts`); campos extras enviados na requisição são descartados.
- O **token do chamado** é um UUID por chamado: dá acesso àquele chamado e só a ele.
  Anotações internas nunca são devolvidas na rota pública.
- A busca de chamado exige **protocolo + e-mail**, para ninguém achar chamado alheio
  chutando número de protocolo.

---

## 6. Como o robô decide as coisas

**Qual fornecedor?** na ordem: endereço exato cadastrado → domínio cadastrado
(`@fornecedor.com.br`) → mesmo domínio do e-mail de cobrança.

**Qual contrato?** se o fornecedor tem um só, é ele. Se tem vários, pontua por
`palavras-chave` e `identificador` encontrados no assunto, corpo e nome dos anexos.

**Qual competência?** procura uma data citada no texto (`09/2026`, `setembro/2026`).
Se não achar, usa a competência em aberto mais antiga daquele contrato.

**O anexo é nota ou fatura?**

| Pista | Classificação |
|---|---|
| `.xml` | nota fiscal (confiança alta) |
| nome/assunto com *boleto*, *cobrança*, *título* | boleto |
| *nfse*, *nfe*, *danfe*, *nota fiscal* | nota fiscal |
| *fatura*, *invoice*, *demonstrativo* | fatura |
| PDF sem nenhuma pista | **confiança baixa** |

No caso de confiança baixa o robô **não chuta**: marca a fatura como
*"a conferir"*, **para de cobrar** (para não cobrar algo que já chegou) e pede
confirmação humana na tela. É a escolha deliberada de errar para o lado seguro.

---

## 7. Estrutura

```
src/
├── app/
│   ├── (painel)/          telas autenticadas (dashboard, faturas, contas...)
│   ├── abrir-chamado/     portal público
│   ├── acompanhar/        acompanhamento por token
│   ├── login/ setup/      acesso
│   └── api/               rotas de servidor
├── components/            Shell, UI, Gráficos, Logo
├── lib/
│   ├── supabase.ts        cliente admin (service_role)
│   ├── imap.ts            leitura do webmail + classificação
│   ├── mailer.ts          envio SMTP
│   ├── templates.ts       e-mails (cobrança e chamados)
│   ├── robo.ts            motor: processarEmails() e executarCobrancas()
│   ├── auth.ts            sessão assinada (HMAC)
│   └── crud-config.ts     whitelist do CRUD
└── middleware.ts          proteção das rotas
```

**Projeto Supabase:** `GESTAO TI` (`mpupmrzcbygwpblrewrb`, região São Paulo)

---

## 8. Cores dos gráficos

A paleta das categorias foi validada por script contra o fundo escuro do painel:
banda de luminosidade, piso de croma, separação para daltonismo (ΔE 8,4), piso de
visão normal (19,3) e contraste ≥ 3:1 — **todos aprovados**. Ao criar categorias
novas, use as cores oferecidas na tela de Configurações em vez de cores livres.
