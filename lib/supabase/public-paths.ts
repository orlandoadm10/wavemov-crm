/**
 * Quem passa pelo middleware sem sessão do CRM.
 *
 * Extraído de `middleware.ts` para poder ser testado sem subir Next nem
 * Supabase — e porque esta lista já custou caro: `/api/forms` faltava nela, e
 * toda submissão de formulário público era redirecionada para `/login`, que
 * responde 200 com HTML. O `fetch` da página seguia o redirect, `res.ok`
 * ficava verdadeiro, o visitante lia "Recebido com sucesso" e nenhum lead era
 * gravado. Um defeito de UMA linha de configuração, invisível em todo teste
 * que o projeto tinha.
 *
 * `lib/supabase/public-paths.test.mts` prende esta lista de duas formas: pelo
 * comportamento esperado de cada caminho e por uma varredura de
 * `app/api/**` que obriga toda rota nova a declarar explicitamente se é
 * pública ou privada.
 */

/**
 * As três rotas de `/api` aqui autenticam POR CONTA PRÓPRIA, com o mecanismo
 * de quem as chama — e quem as chama nunca tem cookie de sessão:
 *
 *   - `/api/webhooks` — segredo por instância WhatsApp (migration 0010).
 *   - `/api/forms`    — submissão da página pública `/f/[slug]`, feita pelo
 *                       próprio lead, que não tem conta no CRM.
 *   - `/api/ingest`   — credencial por organização no cabeçalho
 *                       `x-webhook-secret` (migration 0014). Quem chama é o n8n.
 *   - `/api/v1`, `/api/mcp` — token de API por organização
 *                       (`Authorization: Bearer jid_…`, migration 0029).
 *   - `/api/cron`     — `Authorization: Bearer $CRON_SECRET` (Vercel Cron/n8n).
 *
 * Estar nesta lista NÃO significa "sem autenticação": significa que o
 * middleware não é quem autentica. Antes de acrescentar um caminho aqui,
 * confirme que a rota recusa por conta própria — e acrescente a decisão ao
 * teste, que falha de propósito diante de uma rota de API não declarada.
 */
export const PUBLIC_PATHS = [
  "/login",
  "/register",
  // Pedir o link de redefinição e recebê-lo: quem esqueceu a senha não tem
  // sessão. `/redefinir-senha` NÃO entra — ela exige a sessão que o link cria.
  "/esqueci-senha",
  "/auth",
  "/f",
  "/api/webhooks",
  "/api/forms",
  "/api/ingest",
  "/api/v1",
  "/api/mcp",
  "/api/cron",
] as const;

/**
 * O casamento é por SEGMENTO, não por prefixo de string.
 *
 * `pathname.startsWith("/api/forms")` também aceitaria `/api/formsecretos`:
 * uma rota futura cujo nome apenas começa igual nasceria pública sem ninguém
 * decidir isso. Comparar `=== p` ou `startsWith(p + "/")` fecha essa porta
 * sem mudar o resultado de nenhuma rota que existe hoje — o teste enumera
 * todas para provar.
 */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
