import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente administrativo do Supabase.
 *
 * IMPORTANTE: só pode ser usado em código de servidor (Server Components,
 * Route Handlers, Server Actions). A service_role ignora RLS — se essa chave
 * for para o browser, qualquer pessoa lê o banco inteiro.
 *
 * A arquitetura deste sistema é deliberadamente "servidor-primeiro": o
 * navegador nunca fala direto com o Supabase, ele fala com as rotas /api
 * deste projeto, que aplicam as regras de acesso.
 */

let cached: SupabaseClient | null = null;

/**
 * Confere se a chave pertence mesmo ao projeto da URL configurada.
 *
 * O `ref` dentro do JWT identifica o projeto Supabase. Uma variável de
 * ambiente do sistema operacional tem precedência sobre o .env.local, então
 * uma chave sobrando de outro projeto na máquina passa a valer aqui sem
 * qualquer aviso. Se as duas URLs fossem parecidas, o sistema gravaria no
 * banco errado em silêncio — por isso a conferência é feita na largada.
 */
function conferirProjeto(url: string, key: string): void {
  const refUrl = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
  if (!refUrl) return;

  let refKey: string | undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1] ?? "", "base64").toString()
    ) as { ref?: string };
    refKey = payload.ref;
  } catch {
    return; // chave em formato novo (sb_secret_...) não traz o ref
  }

  if (refKey && refKey !== refUrl) {
    throw new Error(
      `A chave do Supabase é do projeto "${refKey}", mas a URL configurada aponta para "${refUrl}". ` +
        `Verifique se existe uma variável de ambiente SUPABASE_SERVICE_ROLE_KEY definida no sistema ` +
        `operacional — ela tem precedência sobre o .env.local e costuma ser resquício de outro projeto.`
    );
  }
}

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Configuração ausente: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local (ou nas variáveis de ambiente da Vercel)."
    );
  }

  conferirProjeto(url, key);

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}

export const BUCKET_DOCUMENTOS = "documentos-ti";
