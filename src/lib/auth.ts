/**
 * Sessão do painel.
 *
 * As credenciais ficam no Supabase Auth (senha com hash, nunca no nosso código).
 * Depois do login válido emitimos um cookie próprio assinado com HMAC-SHA256,
 * que o middleware consegue validar no Edge sem ida ao banco.
 */

const COOKIE = "gti_sessao";
const DURACAO_HORAS = 12;

export type Sessao = {
  sub: string;   // id do usuário
  email: string;
  nome: string;
  papel: "admin" | "tecnico" | "leitor";
  exp: number;   // epoch em segundos
};

function segredo(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 24) {
    throw new Error(
      "SESSION_SECRET ausente ou muito curto. Gere um valor aleatório de 32+ caracteres."
    );
  }
  return s;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function chaveHmac(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function assinarSessao(dados: Omit<Sessao, "exp">): Promise<string> {
  const payload: Sessao = {
    ...dados,
    exp: Math.floor(Date.now() / 1000) + DURACAO_HORAS * 3600,
  };
  const corpo = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const assinatura = await crypto.subtle.sign("HMAC", await chaveHmac(), new TextEncoder().encode(corpo));
  return `${corpo}.${b64urlEncode(new Uint8Array(assinatura))}`;
}

export async function verificarSessao(token: string | undefined | null): Promise<Sessao | null> {
  if (!token) return null;
  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) return null;

  try {
    const valido = await crypto.subtle.verify(
      "HMAC",
      await chaveHmac(),
      b64urlDecode(assinatura),
      new TextEncoder().encode(corpo)
    );
    if (!valido) return null;

    const sessao = JSON.parse(new TextDecoder().decode(b64urlDecode(corpo))) as Sessao;
    if (sessao.exp * 1000 < Date.now()) return null;
    return sessao;
  } catch {
    return null;
  }
}

export const COOKIE_SESSAO = COOKIE;

export function opcoesCookie() {
  return {
    name: COOKIE,
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_HORAS * 3600,
  };
}
