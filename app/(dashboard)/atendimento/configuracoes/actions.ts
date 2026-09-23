"use server";

import { generateWebhookSecret } from "@/lib/services/webhook-secret";
import { getSessionContext } from "@/lib/services/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type RotateResult = { error?: string; success?: string };

// A organização vem SEMPRE da sessão do servidor, nunca do cliente: aceitar
// `organization_id` do corpo permitiria que um membro da empresa A girasse
// (ou criasse) o segredo da empresa B.
const orgIdSchema = z.string().uuid();

/**
 * Gera um segredo novo para a instância WhatsApp da organização ativa.
 *
 * Rotação isolada: mexe em uma linha de `whatsapp_instances` e não afeta
 * nenhuma outra empresa. Depois de rodar, o operador precisa colar a URL
 * nova no painel da UAZAPI — o webhook antigo para de ser aceito no mesmo
 * instante. Não há aceitação paralela do segredo global legado.
 */
export async function rotateWebhookSecretAction(): Promise<RotateResult> {
  const session = await getSessionContext();

  // Só quem administra a empresa mexe no segredo. `seller`, `agent` e
  // `viewer` nem enxergam a URL do webhook na tela.
  const canManage =
    session.membership.role === "org_admin" || session.profile.is_global_admin;
  if (!canManage) {
    return { error: "Apenas administradores da empresa podem gerar o segredo do webhook." };
  }

  const parsedOrg = orgIdSchema.safeParse(session.organization.id);
  if (!parsedOrg.success) {
    return { error: "Organização inválida." };
  }
  const organizationId = parsedOrg.data;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error:
        "SUPABASE_SERVICE_ROLE_KEY não configurada — necessária para gerar o segredo do webhook.",
    };
  }

  const admin = createAdminClient();
  const secret = generateWebhookSecret();

  const { data: instance, error: readError } = await admin
    .from("whatsapp_instances")
    .select("id")
    .eq("organization_id", organizationId)
    .neq("provider", "meta_cloud")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (readError) {
    console.error("[webhook-secret] falha ao ler instância", readError);
    return { error: "Não foi possível ler a instância desta empresa." };
  }

  if (instance) {
    const { error } = await admin
      .from("whatsapp_instances")
      .update({ webhook_secret: secret })
      .eq("id", instance.id)
      .eq("organization_id", organizationId);
    if (error) {
      console.error("[webhook-secret] falha ao rotacionar", error);
      return { error: "Não foi possível gerar o segredo. Tente novamente." };
    }
  } else {
    // Empresa que ainda não salvou credenciais UAZAPI: cria a linha apenas
    // com o segredo. `base_url`/`token_encrypted` continuam nulos e
    // `resolveConfig()` segue caindo na configuração de ambiente, então nada
    // muda no envio — só passa a existir um segredo próprio para receber.
    const { error } = await admin.from("whatsapp_instances").insert({
      organization_id: organizationId,
      name: "Principal",
      webhook_secret: secret,
    });
    if (error) {
      console.error("[webhook-secret] falha ao criar instância", error);
      return { error: "Não foi possível gerar o segredo. Tente novamente." };
    }
  }

  revalidatePath("/atendimento/configuracoes");
  // O segredo NÃO volta no retorno da action: a tela relê do servidor e só
  // renderiza a URL para quem tem papel de administrador.
  return { success: "Segredo gerado. Cole a URL nova no painel da UAZAPI." };
}

// ------------------------------------------------------------
// API oficial da Meta (WhatsApp Cloud API) — migration 0027
//
// É uma instância SEPARADA da UAZAPI (`provider = 'meta_cloud'`), não uma
// conversão da existente: trocar o provedor da instância em uso mudaria por
// onde saem as respostas de todas as conversas abertas. Conversas que chegam
// pela Meta guardam a instância e respondem por ela.
// ------------------------------------------------------------
const metaInstanceSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome ao número.").max(60),
  phone_number_id: z.string().trim().regex(/^\d{6,30}$/, "Phone Number ID: apenas números, como no painel da Meta."),
  business_account_id: z
    .string()
    .trim()
    .regex(/^\d{6,30}$/, "WhatsApp Business Account ID: apenas números.")
    .or(z.literal("")),
  display_phone: z.string().trim().max(30),
  // "__unchanged__" mantém o token já salvo, que nunca volta para a tela.
  access_token: z
    .literal("__unchanged__")
    .or(z.string().trim().min(20, "Cole o token de acesso permanente do app.").max(1000)),
});

export async function saveMetaInstanceAction(input: unknown): Promise<RotateResult> {
  const session = await getSessionContext();
  const canManage = session.membership.role === "org_admin" || session.profile.is_global_admin;
  if (!canManage) return { error: "Apenas administradores da empresa configuram a API oficial." };

  const parsed = metaInstanceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const organizationId = session.organization.id;
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("whatsapp_instances")
    .select("id, token_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "meta_cloud")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const keepToken = parsed.data.access_token === "__unchanged__";
  if (keepToken && !existing?.token_encrypted) return { error: "Cole o token de acesso do app." };

  const payload = {
    organization_id: organizationId,
    provider: "meta_cloud",
    name: parsed.data.name,
    phone_number_id: parsed.data.phone_number_id,
    business_account_id: parsed.data.business_account_id || null,
    display_phone: parsed.data.display_phone || null,
    token_encrypted: keepToken ? existing!.token_encrypted : parsed.data.access_token,
    status: "connected",
  };

  const { error } = existing
    ? await admin.from("whatsapp_instances").update(payload).eq("id", existing.id).eq("organization_id", organizationId)
    : await admin.from("whatsapp_instances").insert({ ...payload, webhook_secret: generateWebhookSecret() });

  if (error) {
    if (error.code === "23505") {
      return { error: "Este Phone Number ID já está cadastrado em outra instância." };
    }
    console.error("[meta-instance] falha ao salvar", error);
    return { error: "Não foi possível salvar a instância da Meta." };
  }

  revalidatePath("/atendimento/configuracoes");
  return { success: "API oficial configurada. Cadastre a URL de callback e o token de verificação no painel da Meta." };
}
