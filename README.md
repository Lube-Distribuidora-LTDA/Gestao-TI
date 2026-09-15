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

**Confirme os hosts da Locaweb** no painel deles. Os valores mais comuns:

```
IMAP_HOST=imap.lube.com.br     (ou email-ssl.com.br)
SMTP_HOST=smtp.lube.com.br     (ou email-ssl.com.br)
```

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

```bash
npx vercel
```

Depois, em **Vercel → Settings → Environment Variables**, cadastre **todas** as
variáveis do `.env.local`, e ajuste:

```
NEXT_PUBLIC_APP_URL=https://gestao-ti-lube.vercel.app
```

(sem isso os links dos e-mails apontam para `localhost`)

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

Definidas em `vercel.json` (horários em UTC; o Brasil é UTC−3):

| Tarefa | Quando | Horário de Brasília |
|---|---|---|
| Ler webmail | `0 11,14,17,20 * * *` | 8h, 11h, 14h e 17h |
| Cobrar fornecedores | `0 12 * * 1-5` | 9h, de segunda a sexta |
| Abrir competências | `0 9 1 * *` | 6h do dia 1º |

> **Atenção ao plano da Vercel:** o plano *Hobby* permite apenas **2 cron jobs** e
> **1 execução por dia**. Se você estiver no Hobby, reduza para dois agendamentos
> diários ou faça upgrade para o Pro. As rotas continuam funcionando manualmente
> pelo painel em qualquer plano.

As rotas `/api/cron/*` são protegidas pelo `CRON_SECRET` — a Vercel envia esse
segredo automaticamente. Para testar à mão:

```bash
curl "https://SEU-APP.vercel.app/api/cron/ler-emails?secret=SEU_CRON_SECRET"
```

---

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
