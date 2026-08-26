// ============================================================
// Segredo do webhook UAZAPI — USO EXCLUSIVO NO SERVIDOR
//
// Cada instância WhatsApp tem o próprio segredo (`whatsapp_instances.
// webhook_secret`, migration 0010). Este módulo concentra a geração e a
// comparação; nada daqui pode ser importado por componente cliente.
// ============================================================
import { createHash, randomBytes, timingSafeEqual } from "crypto";

// Mesmo prefixo usado por `public.generate_webhook_secret()` no banco:
// identifica à primeira vista, no painel da UAZAPI e nos logs, quem já
// migrou para o token por instância.
export const WEBHOOK_SECRET_PREFIX = "wmv_";

// Segredo novo para uma instância (rotação). 32 bytes = 256 bits.
export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString("hex")}`;
}

/**
 * Comparação em tempo constante.
 *
 * `===` em string sai no primeiro byte diferente, o que transforma o tempo
 * de resposta num oráculo: dá para descobrir o segredo caractere a
 * caractere. `timingSafeEqual` exige buffers do mesmo tamanho e estoura
 * quando diferem — por isso comparamos o SHA-256 dos dois lados, que tem
 * sempre 32 bytes e não vaza nem o comprimento do segredo.
 */
export function secretsMatch(
  presented: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!presented || !expected) return false;
  const a = createHash("sha256").update(presented, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

// URL que o operador cola no painel da UAZAPI.
// `?org=` continua na URL porque a rota o usa para conferir a origem contra
// a instância do payload; o que autentica de fato é o `secret`.
export function buildWebhookUrl(
  appUrl: string,
  organizationId: string,
  secret: string
): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/api/webhooks/uazapi?org=${organizationId}&secret=${encodeURIComponent(secret)}`;
}
