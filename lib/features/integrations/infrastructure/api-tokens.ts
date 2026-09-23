// ============================================================
// Tokens de API por empresa (migration 0029). USO EXCLUSIVO NO SERVIDOR.
//
// O valor `jid_<64 hex>` só existe na tela no momento da criação; o banco
// guarda o SHA-256. A organização do chamador SEMPRE sai do token.
// ============================================================
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const API_TOKEN_PREFIX = "jid_";

export type ApiScope = "api" | "mcp";

export function generateApiToken() {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString("hex")}`;
  return { token, hash: hashApiToken(token), prefix: token.slice(0, 12) };
}

export function hashApiToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface AuthenticatedToken {
  tokenId: string;
  organizationId: string;
  scopes: string[];
}

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export async function authenticateApiToken(
  admin: SupabaseClient,
  request: Request,
  scope: ApiScope
): Promise<AuthenticatedToken | null> {
  const presented = bearer(request);
  if (!presented?.startsWith(API_TOKEN_PREFIX)) return null;

  const hash = hashApiToken(presented);
  const { data } = await admin
    .from("api_tokens")
    .select("id, organization_id, token_hash, scopes, expires_at, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!data) return null;
  // Igualdade já feita no índice; reconfere em tempo constante por defesa.
  if (!timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(String(data.token_hash), "hex"))) return null;
  if (data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  if (!(data.scopes as string[]).includes(scope)) return null;

  // Registro de uso sem segurar a resposta nem falhar a chamada.
  void admin.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  return { tokenId: data.id, organizationId: data.organization_id, scopes: data.scopes };
}

/** Segredo de cron comparado em tempo constante; sem a variável, recusa. */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const presented = bearer(request);
  if (!secret || !presented) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
