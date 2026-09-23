"use server";

import { indexKnowledgeDocument } from "@/lib/features/ai-agent/application/knowledge-base";
import { AI_TOOL_NAMES } from "@/lib/features/crm-tools/domain/tool-labels";
import { getSessionContext } from "@/lib/services/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { describeWriteError } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

export type AiActionResult = { error?: string; success?: string };

/**
 * Configuração dos agentes e da base de conhecimento.
 *
 * Escritas com o cliente da SESSÃO: as policies da 0026 exigem
 * `is_org_admin`, então o banco decide. Só a indexação (trechos com
 * embedding) usa service_role, porque `knowledge_chunks` não aceita escrita
 * de `authenticated` — e ela só roda depois de a sessão ter criado/alterado
 * o documento, prova de que é administrador daquela empresa.
 */

function isOrgAdmin(session: Awaited<ReturnType<typeof getSessionContext>>) {
  return session.membership.role === "org_admin" || session.profile.is_global_admin;
}

const DENIED = { error: "Apenas administradores da empresa configuram a IA." };

const agentSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome ao agente.").max(60),
  description: z.string().trim().max(300).nullable(),
  is_active: z.boolean(),
  is_default: z.boolean(),
  model: z.string().trim().min(2, "Informe o modelo.").max(100),
  temperature: z.coerce.number().min(0).max(1.5),
  system_prompt: z.string().trim().max(12000),
  enabled_tools: z.array(z.enum(AI_TOOL_NAMES as [string, ...string[]])).max(AI_TOOL_NAMES.length),
  use_knowledge_base: z.boolean(),
  auto_reply_new_conversations: z.boolean(),
  reply_delay_seconds: z.coerce.number().int().min(0).max(30),
  handoff_on_request: z.boolean(),
  handoff_on_legal: z.boolean(),
  handoff_on_uncertainty: z.boolean(),
  handoff_message: z.string().trim().max(500).nullable(),
  qualification_fields: z
    .array(
      z.object({
        key: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_]{1,39}$/, "Chave da qualificação: minúsculas, números e _ (ex.: orcamento)."),
        label: z.string().trim().min(2).max(60),
        description: z.string().trim().max(200).optional(),
      })
    )
    .max(15),
});

export async function saveAgentAction(agentId: string | null, input: unknown): Promise<AiActionResult> {
  const session = await getSessionContext();
  if (!isOrgAdmin(session)) return DENIED;
  const parsed = agentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const orgId = session.organization.id;

  // Um padrão por empresa (índice único da 0026): tira o anterior primeiro.
  if (parsed.data.is_default) {
    let clear = supabase
      .from("ai_agents")
      .update({ is_default: false })
      .eq("organization_id", orgId)
      .eq("is_default", true);
    if (agentId) clear = clear.neq("id", agentId);
    const { error: clearError } = await clear;
    if (clearError) return { error: describeWriteError(clearError, "Não foi possível trocar o agente padrão.") };
  }

  const payload = { ...parsed.data, organization_id: orgId };
  const query = agentId
    ? supabase.from("ai_agents").update(payload).eq("id", agentId).eq("organization_id", orgId)
    : supabase.from("ai_agents").insert({ ...payload, created_by: session.profile.id });
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) return { error: describeWriteError(error, "Não foi possível salvar o agente.") };

  revalidatePath("/ia");
  return { success: agentId ? "Agente atualizado." : "Agente criado." };
}

export async function deleteAgentAction(agentId: string): Promise<AiActionResult> {
  const session = await getSessionContext();
  if (!isOrgAdmin(session)) return DENIED;
  if (!z.string().uuid().safeParse(agentId).success) return { error: "Agente inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_agents")
    .delete()
    .eq("id", agentId)
    .eq("organization_id", session.organization.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: describeWriteError(error, "Não foi possível excluir o agente.") };

  revalidatePath("/ia");
  return { success: "Agente excluído. Conversas que ele atendia voltaram para a equipe." };
}

const documentSchema = z.object({
  title: z.string().trim().min(2, "Dê um título ao material.").max(120),
  content: z.string().trim().min(20, "O material precisa ter pelo menos 20 caracteres.").max(200_000),
  source_type: z.enum(["text", "faq", "url"]),
  source_url: z.string().trim().url().max(500).nullable(),
  agent_id: z.string().uuid().nullable(),
});

export async function saveKnowledgeDocumentAction(documentId: string | null, input: unknown): Promise<AiActionResult> {
  const session = await getSessionContext();
  if (!isOrgAdmin(session)) return DENIED;
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const orgId = session.organization.id;
  const payload = { ...parsed.data, status: "pending" as const, error: null };
  const query = documentId
    ? supabase.from("knowledge_documents").update(payload).eq("id", documentId).eq("organization_id", orgId)
    : supabase
        .from("knowledge_documents")
        .insert({ ...payload, organization_id: orgId, created_by: session.profile.id });
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) return { error: describeWriteError(error, "Não foi possível salvar o material.") };

  scheduleIndexing(orgId, data.id);
  revalidatePath("/ia");
  return { success: "Material salvo. A indexação leva alguns segundos." };
}

export async function reindexKnowledgeDocumentAction(documentId: string): Promise<AiActionResult> {
  const session = await getSessionContext();
  if (!isOrgAdmin(session)) return DENIED;
  const supabase = await createClient();
  const { data } = await supabase
    .from("knowledge_documents")
    .update({ status: "pending", error: null })
    .eq("id", documentId)
    .eq("organization_id", session.organization.id)
    .select("id")
    .maybeSingle();
  if (!data) return { error: "Material não encontrado." };
  scheduleIndexing(session.organization.id, data.id);
  revalidatePath("/ia");
  return { success: "Reindexação iniciada." };
}

export async function deleteKnowledgeDocumentAction(documentId: string): Promise<AiActionResult> {
  const session = await getSessionContext();
  if (!isOrgAdmin(session)) return DENIED;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .delete()
    .eq("id", documentId)
    .eq("organization_id", session.organization.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: describeWriteError(error, "Não foi possível excluir o material.") };
  revalidatePath("/ia");
  return { success: "Material excluído." };
}

function scheduleIndexing(organizationId: string, documentId: string) {
  after(async () => {
    const result = await indexKnowledgeDocument(createAdminClient(), organizationId, documentId);
    if (!result.ok) console.error("[ia] indexação falhou", { documentId, error: result.error });
  });
}
