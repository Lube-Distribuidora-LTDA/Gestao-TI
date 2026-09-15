/**
 * As rotas /api/cron/* ficam fora da sessão do painel (o agendador não faz
 * login), então a proteção é um segredo compartilhado.
 *
 * A Vercel envia automaticamente `Authorization: Bearer $CRON_SECRET` nos
 * jobs declarados em vercel.json. Também aceitamos ?secret= para permitir
 * teste manual e agendadores externos.
 */
export function cronAutorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;

  // sem segredo configurado a rota fica fechada, nunca aberta
  if (!segredo) return false;

  const header = req.headers.get("authorization");
  if (header === `Bearer ${segredo}`) return true;

  const url = new URL(req.url);
  if (url.searchParams.get("secret") === segredo) return true;

  return false;
}
