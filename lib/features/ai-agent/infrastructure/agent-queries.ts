// ============================================================
// Leituras do turno do agente (service_role, organização sempre filtrada).
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiAgent, AiRun, HandlingMode } from "@/types";

export interface TurnConversation {
  id: string;
  organization_id: string;
  deal_id: string | null;
  contact_id: string | null;
  status: string;
  handling_mode: HandlingMode;
  ai_agent_id: string | null;
}

export interface TurnMessage {
  id: string;
  direction: "inbound" | "outbound";
  content: string | null;
  message_type: string;
  sender_type: string | null;
  created_at: string;
}

export async function loadTurnConversation(
  admin: SupabaseClient,
  organizationId: string,
  conversationId: string
): Promise<TurnConversation | null> {
  const { data } = await admin
    .from("whatsapp_conversations")
    .select("id, organization_id, deal_id, contact_id, status, handling_mode, ai_agent_id")
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .maybeSingle<TurnConversation>();
  return data ?? null;
}

/** Agente da conversa; sem vínculo, o padrão ativo da empresa. */
export async function loadAgentForConversation(
  admin: SupabaseClient,
  organizationId: string,
  agentId: string | null
): Promise<AiAgent | null> {
  const base = admin.from("ai_agents").select("*").eq("organization_id", organizationId);
  const { data } = agentId
    ? await base.eq("id", agentId).maybeSingle<AiAgent>()
    : await base.eq("is_default", true).maybeSingle<AiAgent>();
  return data ?? null;
}

export async function loadRecentMessages(
  admin: SupabaseClient,
  organizationId: string,
  conversationId: string,
  limit = 24
): Promise<TurnMessage[]> {
  const { data } = await admin
    .from("whatsapp_messages")
    .select("id, direction, content, message_type, sender_type, created_at")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data as TurnMessage[] | null) ?? []).reverse();
}

export async function loadLeadSnapshot(admin: SupabaseClient, organizationId: string, dealId: string | null) {
  if (!dealId) return null;
  const { data } = await admin
    .from("deals")
    .select("id, title, ai_status, ai_qualification, stage:pipeline_stages(name, requires_human), contact:contacts(name)")
    .eq("id", dealId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) return null;
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const stage = one(data.stage as { name: string; requires_human: boolean | null } | { name: string; requires_human: boolean | null }[] | null);
  const contact = one(data.contact as { name: string } | { name: string }[] | null);
  return {
    dealId: data.id as string,
    dealTitle: data.title as string,
    aiStatus: data.ai_status as string,
    qualification: (data.ai_qualification as Record<string, unknown> | null) ?? {},
    stageName: stage?.name ?? null,
    stageRequiresHuman: Boolean(stage?.requires_human),
    contactName: contact?.name ?? null,
  };
}

export async function organizationName(admin: SupabaseClient, organizationId: string) {
  const { data } = await admin.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  return (data?.name as string | undefined) ?? "nossa empresa";
}

export async function recordAiRun(
  admin: SupabaseClient,
  run: Omit<AiRun, "id" | "created_at">
) {
  const { error } = await admin.from("ai_runs").insert(run);
  if (error) console.error("[ai-agent] falha ao gravar ai_runs", error.message);
}
