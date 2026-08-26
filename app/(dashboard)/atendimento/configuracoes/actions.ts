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
