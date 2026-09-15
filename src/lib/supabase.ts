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

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Configuração ausente: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local (ou nas variáveis de ambiente da Vercel)."
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}

export const BUCKET_DOCUMENTOS = "documentos-ti";
