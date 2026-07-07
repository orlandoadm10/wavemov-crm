// USO EXCLUSIVO NO SERVIDOR — importa o admin client (service role).
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnvConfig, type UazapiConfig } from "@/lib/services/uazapi";
import type { WhatsAppInstance } from "@/types";

// Carrega a instância WhatsApp da organização (server-only).
export async function getInstanceForOrg(
  organizationId: string
): Promise<WhatsAppInstance | null> {
  // Sem service role configurada, a área de WhatsApp fica desabilitada
  // (instância "desconectada") em vez de quebrar a página.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (data as WhatsAppInstance) ?? null;
}

// Resolve a configuração UAZAPI: dados da instância no banco,
// com fallback para variáveis de ambiente.
export function resolveConfig(instance: WhatsAppInstance | null): UazapiConfig | null {
  if (instance?.base_url && instance.token_encrypted && instance.instance_id) {
    return {
      baseUrl: instance.base_url,
      token: instance.token_encrypted,
      instanceId: instance.instance_id,
    };
  }
  return getEnvConfig();
}

// Versão segura da instância para enviar ao cliente (sem token)
export function toPublicInstance(instance: WhatsAppInstance | null) {
  if (!instance) return null;
  const { token_encrypted, ...rest } = instance;
  return { ...rest, has_token: Boolean(token_encrypted) };
}

export type PublicInstance = ReturnType<typeof toPublicInstance>;
