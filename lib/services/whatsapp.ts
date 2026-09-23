// USO EXCLUSIVO NO SERVIDOR — importa o admin client (service role).
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnvConfig, type UazapiConfig } from "@/lib/services/uazapi";
import type { WhatsAppInstance } from "@/types";

// Carrega a instância UAZAPI da organização (server-only).
//
// A instância da API oficial da Meta (0027) é separada e fica de fora: esta
// função alimenta a tela da UAZAPI e o envio de conversas legadas, anteriores
// à 0010, que não guardam a instância — e essas são todas da UAZAPI.
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
    .neq("provider", "meta_cloud")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (data as WhatsAppInstance) ?? null;
}

// Instância da API oficial da Meta da organização (server-only).
export async function getMetaInstanceForOrg(
  organizationId: string
): Promise<WhatsAppInstance | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "meta_cloud")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (data as WhatsAppInstance) ?? null;
}

// Carrega uma instância específica da organização (server-only).
// O filtro por `organization_id` é redundante com o `id` — e proposital:
// com service role não há RLS, então um id vindo de outra empresa nunca
// pode devolver linha. Uso: responder pela MESMA instância que recebeu a
// mensagem, agora que uma empresa pode ter mais de um atendente conectado.
export async function getInstanceById(
  organizationId: string,
  instanceId: string
): Promise<WhatsAppInstance | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("id", instanceId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as WhatsAppInstance) ?? null;
}

// Resolve a configuração UAZAPI: dados da instância no banco,
// com fallback para variáveis de ambiente.
export function resolveConfig(instance: WhatsAppInstance | null): UazapiConfig | null {
  if (instance?.base_url && instance.token_encrypted) {
    return { baseUrl: instance.base_url, token: instance.token_encrypted };
  }
  return getEnvConfig();
}

// Versão segura da instância para enviar ao cliente.
// Remove os DOIS segredos da linha: o token da UAZAPI e o segredo do webhook
// (0010). Qualquer campo novo sensível em `whatsapp_instances` precisa entrar
// nesta desestruturação — o que sobra aqui vira prop de componente cliente.
export function toPublicInstance(instance: WhatsAppInstance | null) {
  if (!instance) return null;
  const { token_encrypted, webhook_secret, ...rest } = instance;
  return { ...rest, has_token: Boolean(token_encrypted) };
}

export type PublicInstance = ReturnType<typeof toPublicInstance>;
