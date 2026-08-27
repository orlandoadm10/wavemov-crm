"use server";

import { getSessionContext } from "@/lib/services/session";
import { generateWebhookSecret } from "@/lib/services/webhook-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type IngestSecretResult = { error?: string; success?: string };

/**
 * Gera (ou rotaciona) o segredo de ingestão externa da organização ativa.
 *
 * A organização vem SEMPRE da sessão do servidor. Aceitar `organization_id`
 * do cliente permitiria a um membro da empresa A rotacionar — ou criar — o
 * segredo da empresa B, derrubando os fluxos n8n dela.
 *
 * Não há período de aceitação do segredo antigo: rotacionou, todo fluxo do
 * n8n daquela empresa é recusado até o valor novo ser colado lá. É a mesma
 * decisão da 0010, pelo mesmo motivo — compatibilidade paralela é caminho
 * que ninguém remove depois.
 */
export async function rotateIngestSecretAction(): Promise<IngestSecretResult> {
  const session = await getSessionContext();

  const canManage =
    session.membership.role === "org_admin" || session.profile.is_global_admin;
  if (!canManage) {
    return { error: "Apenas administradores da empresa podem gerar a credencial de integração." };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error:
        "SUPABASE_SERVICE_ROLE_KEY não configurada — necessária para gerar a credencial de integração.",
    };
  }

  const admin = createAdminClient();
  const organizationId = session.organization.id;
  const secret = generateWebhookSecret();

  // `upsert` cobre os dois casos num caminho só: a empresa que veio do
  // backfill da 0014 e a criada depois dela, que ainda não tem linha (a
  // migration não gera segredo para quem talvez nunca use n8n).
  const { data, error } = await admin
    .from("organization_ingest_secrets")
    .upsert(
      { organization_id: organizationId, secret, rotated_at: new Date().toISOString() },
      { onConflict: "organization_id" }
    )
    .select("organization_id")
    .maybeSingle();

  // Escrita sob service role também precisa confirmar linha: sem o `.select()`
  // um upsert que não atingiu nada anunciaria sucesso e o operador colaria no
  // n8n um segredo que o banco não conhece.
  if (error || !data) {
    console.error("[ingest-secret] falha ao rotacionar", error);
    return { error: "Não foi possível gerar a credencial. Tente novamente." };
  }

  revalidatePath("/formularios");
  // O segredo NÃO volta no retorno: a tela relê do servidor e só o renderiza
  // para quem tem papel de administrador.
  return { success: "Credencial gerada. Cole o valor novo nos fluxos do n8n desta empresa." };
}
