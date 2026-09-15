/**
 * Cadastra na Vercel todas as variáveis de ambiente do .env.local.
 *
 * Como usar:
 *   1. npx vercel login
 *   2. npx vercel link        (escolha o projeto "gestao-ti")
 *   3. node scripts/configurar-vercel.mjs
 *
 * Nenhum valor é impresso na tela — o script só mostra o nome de cada
 * variável e se ela foi cadastrada. No fim, ele confere na Vercel o que
 * realmente entrou, em vez de confiar no código de saída da CLI.
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
  NEXT_PUBLIC_APP_URL: process.env.URL_PRODUCAO ?? "https://gestao-ti-ruddy.vercel.app",
};

/**
 * Variáveis que a própria Vercel gerencia e que nunca devem ser cadastradas
 * à mão. O `vercel link` grava VERCEL_OIDC_TOKEN no .env.local para uso
 * local; ele é reemitido a cada execução na nuvem, então fixá-lo como
 * variável de ambiente deixaria um token velho no lugar do válido.
 */
const IGNORAR = new Set(["VERCEL_OIDC_TOKEN", "VERCEL_URL", "VERCEL_ENV", "VERCEL_REGION"]);

const env = {};
for (const linha of fs.readFileSync(ARQUIVO, "utf8").split(/\r?\n/)) {
  const m = linha.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !IGNORAR.has(m[1])) env[m[1]] = m[2].trim();
}

Object.assign(env, SOBRESCREVER);

const AMBIENTES = ["production", "preview", "development"];

function vercel(args) {
  return spawnSync("npx", ["vercel", ...args], { encoding: "utf8", shell: true });
}

console.log(`\nCadastrando ${Object.keys(env).length} variáveis na Vercel...\n`);

for (const [chave, valor] of Object.entries(env)) {
  if (!valor) {
    console.log(`  ○ ${chave.padEnd(32)} vazio no .env.local — pulado`);
    continue;
  }

  /*
   * O tipo precisa ser explícito. A CLI se recusa a adivinhar quando o nome
   * parece secreto mas tem prefixo público (NEXT_PUBLIC_..._KEY, por
   * exemplo): nesse caso ela abre um prompt e, sem terminal interativo,
   * encerra sem cadastrar — ainda assim devolvendo código de saída zero.
   * Foi exatamente o que aconteceu com NEXT_PUBLIC_SUPABASE_ANON_KEY.
   */
  const tipo = chave.startsWith("NEXT_PUBLIC_") ? "config" : "secret";

  for (const ambiente of AMBIENTES) {
    // remove antes de adicionar, para o script ser repetível sem dar erro
    vercel(["env", "rm", chave, ambiente, "--yes"]);
    vercel(["env", "add", chave, ambiente, "--type", tipo, "--value", valor, "--yes"]);
  }

  console.log(`  · ${chave.padEnd(32)} enviado (${valor.length} caracteres, ${tipo})`);
}

/* ---------- conferência: o que de fato está lá? ---------- */
console.log(`\nConferindo o que entrou em production...\n`);

const lista = vercel(["env", "ls", "production"]).stdout ?? "";
const faltando = Object.keys(env).filter(
  (k) => env[k] && !new RegExp(`\\b${k}\\b`).test(lista)
);

if (faltando.length === 0) {
  console.log(`  ✓ todas as ${Object.keys(env).filter((k) => env[k]).length} variáveis estão cadastradas.`);
} else {
  console.log(`  ✗ NÃO foram cadastradas: ${faltando.join(", ")}`);
  console.log(`\n  Cadastre à mão com:`);
  for (const k of faltando) {
    const tipo = k.startsWith("NEXT_PUBLIC_") ? "config" : "secret";
    console.log(`    npx vercel env add ${k} production --type ${tipo} --value "<valor>" --yes`);
  }
}

console.log(`\nATENÇÃO: confira NEXT_PUBLIC_APP_URL — está como "${SOBRESCREVER.NEXT_PUBLIC_APP_URL}".`);
console.log(`Se o domínio real for outro, rode de novo com:`);
console.log(`  URL_PRODUCAO=https://seu-dominio.vercel.app node scripts/configurar-vercel.mjs`);
console.log(`\nAs variáveis NEXT_PUBLIC_* são embutidas durante o build, então`);
console.log(`é preciso um deploy novo para valerem:  npx vercel --prod\n`);
