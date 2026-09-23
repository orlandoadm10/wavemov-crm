import type { SupabaseClient } from "@supabase/supabase-js";
import type { StageKind } from "../domain/pipeline-templates";
import {
  parseOnboardingProgress,
  type OnboardingProgress,
  type OnboardingStepSlug,
  type StepDecision,
} from "../domain/steps";

export interface DefaultPipelineSnapshot {
  id: string;
  name: string;
  stages: { name: string; kind: StageKind }[];
  /** Vínculos que impedem trocar as etapas pelo assistente (ver 0030). */
  dealCount: number;
  formCount: number;
}

/** Funil padrão da organização, com o que o prende. `null` se não houver. */
export async function getDefaultPipelineSnapshot(
  supabase: SupabaseClient,
  organizationId: string
): Promise<DefaultPipelineSnapshot | null> {
  const { data: pipeline, error } = await supabase
    .from("pipelines")
    .select("id, name, pipeline_stages(name, order_index, is_won_stage, is_lost_stage)")
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .maybeSingle();
  if (error || !pipeline) return null;

  const [deals, forms] = await Promise.all([
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("pipeline_id", pipeline.id),
    supabase
      .from("forms")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("pipeline_id", pipeline.id),
  ]);

  type StageRow = { name: string; order_index: number; is_won_stage: boolean; is_lost_stage: boolean };
  const stages = ((pipeline.pipeline_stages ?? []) as StageRow[])
    .sort((a, b) => a.order_index - b.order_index)
    .map((s) => ({
      name: s.name,
      kind: (s.is_won_stage ? "won" : s.is_lost_stage ? "lost" : "open") as StageKind,
    }));

  return {
    id: pipeline.id,
    name: pipeline.name,
    stages,
    // Erro de contagem vira "tem vínculo": na dúvida, o assistente não oferece
    // trocar etapas — a RPC recusaria de qualquer forma.
    dealCount: deals.error ? 1 : (deals.count ?? 0),
    formCount: forms.error ? 1 : (forms.count ?? 0),
  };
}

export interface SetupFacts {
  activeMembers: number;
  whatsappStatus: string | null;
  activeAgents: number;
}

/** O que já existe de fato na organização — o resumo não confia só no que foi clicado. */
export async function getSetupFacts(
  supabase: SupabaseClient,
  organizationId: string
): Promise<SetupFacts> {
  const [members, instance, agents] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("whatsapp_instances")
      .select("status")
      .eq("organization_id", organizationId)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ai_agents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("is_active", true),
  ]);
  return {
    activeMembers: members.count ?? 0,
    whatsappStatus: instance.data?.status ?? null,
    activeAgents: agents.count ?? 0,
  };
}

export type SaveResult = { ok: true } | { ok: false; error: string };

const MIGRATION_MISSING =
  "O assistente ainda não está ativo neste banco (migration 0030 pendente). Fale com o suporte.";

/** Grava a decisão de um passo. Sob RLS: só org_admin/admin global altera. */
export async function saveStepDecision(
  supabase: SupabaseClient,
  organizationId: string,
  step: OnboardingStepSlug,
  decision: StepDecision
): Promise<SaveResult> {
  const { data: current, error: readError } = await supabase
    .from("organizations")
    .select("onboarding_steps")
    .eq("id", organizationId)
    .maybeSingle();
  if (readError) return { ok: false, error: MIGRATION_MISSING };

  const progress: OnboardingProgress = {
    ...parseOnboardingProgress(current?.onboarding_steps),
    [step]: decision,
  };
  const { data, error } = await supabase
    .from("organizations")
    .update({ onboarding_steps: progress })
    .eq("id", organizationId)
    .select("id");
  if (error) return { ok: false, error: "Não foi possível salvar o progresso. Tente novamente." };
  if (!data?.length) return { ok: false, error: "Sem permissão para configurar esta empresa." };
  return { ok: true };
}

export async function markOnboarded(
  supabase: SupabaseClient,
  organizationId: string
): Promise<SaveResult> {
  const { data, error } = await supabase
    .from("organizations")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", organizationId)
    .select("id");
  if (error) return { ok: false, error: MIGRATION_MISSING };
  if (!data?.length) return { ok: false, error: "Sem permissão para configurar esta empresa." };
  return { ok: true };
}
