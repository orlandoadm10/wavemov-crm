// ============================================================
// Comandos sobre leads executados pelo SERVIDOR (IA, automações, MCP, API).
//
// A mesma operação que o Kanban faz na sessão do usuário — mover etapa,
// ganhar/perder, registrar histórico — só que com service_role. Por isso
// cada função filtra `organization_id` e confere que a etapa pertence ao
// funil do lead: a RLS não está aqui para fazer isso por nós.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DealRow {
  id: string;
  organization_id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string | null;
  responsible_id: string | null;
  title: string;
  value: number;
  status: string;
  temperature: string;
  ai_status: string;
  ai_qualification: Record<string, unknown> | null;
  source: string | null;
}

export interface StageRow {
  id: string;
  pipeline_id: string;
  name: string;
  order_index: number;
  is_won_stage: boolean;
  is_lost_stage: boolean;
  requires_human?: boolean;
}

const DEAL_COLUMNS =
  "id, organization_id, pipeline_id, stage_id, contact_id, responsible_id, title, value, status, temperature, ai_status, ai_qualification, source";

export async function loadDeal(
  admin: SupabaseClient,
  organizationId: string,
  dealId: string
): Promise<DealRow | null> {
  const { data } = await admin
    .from("deals")
    .select(DEAL_COLUMNS)
    .eq("id", dealId)
    .eq("organization_id", organizationId)
    .maybeSingle<DealRow>();
  return data ?? null;
}

export async function loadPipelineStages(
  admin: SupabaseClient,
  organizationId: string,
  pipelineId: string
): Promise<StageRow[]> {
  // O funil precisa ser da organização: a etapa não guarda organization_id.
  const { data: pipeline } = await admin
    .from("pipelines")
    .select("id")
    .eq("id", pipelineId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!pipeline) return [];
  const { data } = await admin
    .from("pipeline_stages")
    .select("id, pipeline_id, name, order_index, is_won_stage, is_lost_stage, requires_human")
    .eq("pipeline_id", pipelineId)
    .order("order_index");
  return (data as StageRow[] | null) ?? [];
}

/** Acha a etapa por id ou por nome (sem caixa/acento) dentro do funil do lead. */
export function findStage(stages: StageRow[], ref: { stageId?: string; stageName?: string }) {
  if (ref.stageId) return stages.find((s) => s.id === ref.stageId) ?? null;
  if (!ref.stageName) return null;
  const norm = (v: string) =>
    v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const target = norm(ref.stageName);
  return (
    stages.find((s) => norm(s.name) === target) ??
    stages.find((s) => norm(s.name).includes(target)) ??
    null
  );
}

export type MoveResult = { ok: true; stage: StageRow; changed: boolean } | { ok: false; error: string };

export async function moveDealToStage(
  admin: SupabaseClient,
  deal: DealRow,
  stage: StageRow,
  origin: { label: string; actorId?: string | null }
): Promise<MoveResult> {
  if (stage.pipeline_id !== deal.pipeline_id) {
    return { ok: false, error: "A etapa não pertence ao funil deste lead." };
  }
  if (stage.id === deal.stage_id) return { ok: true, stage, changed: false };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { stage_id: stage.id };
  if (stage.is_won_stage) {
    patch.status = "won";
    patch.won_at = now;
  } else if (stage.is_lost_stage) {
    patch.status = "lost";
    patch.lost_at = now;
  } else if (deal.status !== "open") {
    patch.status = "open";
  }

  const { data: updated, error } = await admin
    .from("deals")
    .update(patch)
    .eq("id", deal.id)
    .eq("organization_id", deal.organization_id)
    .select("id")
    .maybeSingle();
  if (error || !updated) return { ok: false, error: "Não foi possível mover o lead." };

  await Promise.all([
    admin.from("deal_stage_history").insert({
      deal_id: deal.id,
      from_stage_id: deal.stage_id,
      to_stage_id: stage.id,
      changed_by: origin.actorId ?? null,
    }),
    admin.from("activity_logs").insert({
      organization_id: deal.organization_id,
      actor_id: origin.actorId ?? null,
      deal_id: deal.id,
      type: stage.is_won_stage ? "deal_won" : stage.is_lost_stage ? "deal_lost" : "stage_changed",
      title: `${origin.label}: etapa alterada para "${stage.name}"`,
      metadata: { source: origin.label },
    }),
  ]);
  return { ok: true, stage, changed: true };
}

export async function addDealNote(
  admin: SupabaseClient,
  organizationId: string,
  dealId: string,
  text: string,
  label: string
) {
  const { error } = await admin.from("activity_logs").insert({
    organization_id: organizationId,
    deal_id: dealId,
    type: "note",
    title: `Nota (${label})`,
    description: text.slice(0, 4000),
    metadata: { source: label },
  });
  return !error;
}

export async function createDealTask(
  admin: SupabaseClient,
  deal: DealRow,
  task: { title: string; description?: string | null; dueInHours?: number | null; priority?: "low" | "medium" | "high"; assignedTo?: string | null }
) {
  const dueAt =
    task.dueInHours != null ? new Date(Date.now() + task.dueInHours * 3_600_000).toISOString() : null;
  const { data, error } = await admin
    .from("tasks")
    .insert({
      organization_id: deal.organization_id,
      deal_id: deal.id,
      contact_id: deal.contact_id,
      assigned_to: task.assignedTo ?? deal.responsible_id,
      title: task.title.slice(0, 200),
      description: task.description ?? null,
      due_at: dueAt,
      priority: task.priority ?? "medium",
    })
    .select("id, due_at")
    .maybeSingle();
  if (error || !data) return null;
  return data as { id: string; due_at: string | null };
}

/** Passa a conversa para a equipe: modo humano, motivo e marca no lead. */
export async function handoffConversation(
  admin: SupabaseClient,
  organizationId: string,
  conversationId: string,
  reason: string
) {
  const { data: conversation } = await admin
    .from("whatsapp_conversations")
    .update({
      handling_mode: "human",
      handoff_reason: reason.slice(0, 300),
      handoff_at: new Date().toISOString(),
      status: "pending",
    })
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .select("id, deal_id")
    .maybeSingle();
  if (!conversation) return false;

  if (conversation.deal_id) {
    await Promise.all([
      admin
        .from("deals")
        .update({ ai_status: "handoff" })
        .eq("id", conversation.deal_id)
        .eq("organization_id", organizationId),
      admin.from("activity_logs").insert({
        organization_id: organizationId,
        deal_id: conversation.deal_id,
        type: "ai_handoff",
        title: "IA transferiu o atendimento para a equipe",
        description: reason.slice(0, 500),
        metadata: { source: "ia" },
      }),
    ]);
  }
  return true;
}
