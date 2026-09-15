/**
 * Cadastra na Vercel todas as variáveis de ambiente do .env.local.
 *
 * Como usar:
 *   1. npx vercel login
 *   2. npx vercel link        (escolha o projeto "gestao-ti")
 *   3. node scripts/configurar-vercel.mjs
 *
 * Nenhum valor é impresso na tela — o script só mostra o nome de cada
 * variável e se ela foi cadastrada.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const RAIZ = process.cwd();
const ARQUIVO = path.join(RAIZ, ".env.local");

if (!fs.existsSync(ARQUIVO)) {
  console.error("✗ .env.local não encontrado. Rode este script na raiz do projeto.");
  process.exit(1);
}

/** Variáveis que NÃO devem ir para a Vercel com o valor local. */
const SOBRESCREVER = {
  // em produção os links dos e-mails precisam apontar para o domínio real
  NEXT_PUBLIC_APP_URL: process.env.URL_PRODUCAO ?? "https://gestao-ti.vercel.app",
};

const env = {};
for (const linha of fs.readFileSync(ARQUIVO, "utf8").split(/\r?\n/)) {
  const m = linha.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

Object.assign(env, SOBRESCREVER);

const AMBIENTES = ["production", "preview", "development"];
let ok = 0;
let falhas = 0;

console.log(`\nCadastrando ${Object.keys(env).length} variáveis na Vercel...\n`);

for (const [chave, valor] of Object.entries(env)) {
  if (!valor) {
    console.log(`  ○ ${chave.padEnd(32)} vazio no .env.local — pulado`);
    continue;
  }

  let sucessos = 0;
  for (const ambiente of AMBIENTES) {
    // remove antes de adicionar, para o script ser repetível sem dar erro
    spawnSync("npx", ["vercel", "env", "rm", chave, ambiente, "--yes"], {
      input: "",
      encoding: "utf8",
      shell: true,
    });

    const r = spawnSync("npx", ["vercel", "env", "add", chave, ambiente], {
      input: valor + "\n",
      encoding: "utf8",
      shell: true,
    });

    if (r.status === 0) sucessos++;
  }

  if (sucessos === AMBIENTES.length) {
    console.log(`  ✓ ${chave.padEnd(32)} (${valor.length} caracteres)`);
    ok++;
  } else {
    console.log(`  ✗ ${chave.padEnd(32)} falhou em ${AMBIENTES.length - sucessos} ambiente(s)`);
    falhas++;
  }
}

console.log(`\n${ok} variável(is) cadastrada(s), ${falhas} com falha.`);
console.log(`\nATENÇÃO: confira NEXT_PUBLIC_APP_URL — está como "${SOBRESCREVER.NEXT_PUBLIC_APP_URL}".`);
console.log(`Se o domínio real for outro, rode de novo com:`);
console.log(`  URL_PRODUCAO=https://seu-dominio.vercel.app node scripts/configurar-vercel.mjs\n`);
console.log(`Depois publique com:  npx vercel --prod\n`);
