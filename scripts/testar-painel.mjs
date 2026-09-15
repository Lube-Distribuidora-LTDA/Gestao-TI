/**
 * Teste de fumaça das telas autenticadas.
 *
 * Existe porque um erro escapou para produção: o dashboard é Server Component
 * e passava componentes de ícone como prop para componentes de cliente, o que
 * o React proíbe. O build compila normalmente — a falha só aparece quando a
 * página é realmente renderizada, e até então nenhum teste abria o painel
 * logado.
 *
 * Gera um cookie de sessão assinado com o SESSION_SECRET local e abre cada
 * tela, procurando por exceções de servidor.
 *
 * Uso:
 *   node scripts/testar-painel.mjs                      (local, porta 3000)
 *   node scripts/testar-painel.mjs https://meu-app.app  (produção)
 */

import fs from "node:fs";
import crypto from "node:crypto";

const env = {};
for (const linha of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = linha.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

if (!env.SESSION_SECRET) {
  console.error("✗ SESSION_SECRET não encontrado no .env.local");
  process.exit(1);
}

// mesma construção de src/lib/auth.ts
const payload = {
  sub: "teste-automatizado",
  email: "teste@lube.com.br",
  nome: "Teste",
  papel: "admin",
  exp: Math.floor(Date.now() / 1000) + 600,
};
const corpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
const assinatura = crypto
  .createHmac("sha256", env.SESSION_SECRET)
  .update(corpo)
  .digest("base64url");
const cookie = `gti_sessao=${corpo}.${assinatura}`;

const BASE = process.argv[2] || "http://localhost:3000";

const TELAS = [
  "/", "/faturas", "/contas", "/fornecedores",
  "/chamados", "/ativos", "/robo", "/configuracoes",
];

const PUBLICAS = ["/login", "/abrir-chamado", "/acompanhar"];

console.log(`\nTestando ${BASE}\n`);

let falhas = 0;

async function abrir(rota, comSessao) {
  try {
    const r = await fetch(BASE + rota, {
      headers: comSessao ? { cookie } : {},
      redirect: "manual",
    });
    const html = await r.text();
    const excecao = /Application error|server-side exception|Internal Server Error/i.test(html);
    const ok = r.status === 200 && !excecao;
    if (!ok) falhas++;
    console.log(
      `  ${ok ? "[OK  ]" : "[FALHA]"} ${rota.padEnd(16)} HTTP ${r.status}` +
        (excecao ? "  <- exceção no servidor" : "")
    );
  } catch (e) {
    falhas++;
    console.log(`  [FALHA] ${rota.padEnd(16)} ${e.message.slice(0, 70)}`);
  }
}

console.log("Telas do painel (com sessão):");
for (const t of TELAS) await abrir(t, true);

console.log("\nTelas públicas (sem sessão):");
for (const t of PUBLICAS) await abrir(t, false);

console.log(
  `\n=> ${falhas === 0 ? "tudo certo" : falhas + " tela(s) com problema"}\n`
);
process.exit(falhas === 0 ? 0 : 1);
