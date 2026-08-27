import { PipelineStagesClient } from "@/components/crm/pipeline-stages-client";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { Pipeline, PipelineStageStats } from "@/types";

export const metadata = { title: "Etapas do funil" };
export const dynamic = "force-dynamic";

type Search = Promise<{ funil?: string }>;

export default async function FunisPage({ searchParams }: { searchParams: Search }) {
  const { funil } = await searchParams;
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const [{ data: pipelinesRaw }, { data: statsRaw }] = await Promise.all([
    supabase
      .from("pipelines")
      .select("*, stages:pipeline_stages(*)")
      .eq("organization_id", orgId)
      .order("created_at"),
    // Volume por etapa vem da view agregada (0009), não de um SELECT em deals
    supabase
      .from("pipeline_stage_stats")
      .select("stage_id, pipeline_id, organization_id, deals_total, deals_open, value_open")
      .eq("organization_id", orgId),
  ]);

  const pipelines = (pipelinesRaw ?? []) as Pipeline[];
  const activePipeline = pipelines.find((p) => p.id === funil) ?? pipelines[0] ?? null;

  // Desde a migration 0012 a estrutura do funil é assunto de administrador:
  // as policies de pipelines/pipeline_stages exigem is_org_admin. Oferecer os
  // controles a um seller só produziria uma escrita recusada pelo banco.
  const canManagePipelines =
    session.membership.role === "org_admin" || session.profile.is_global_admin;

  return (
    <div className="animate-fade-up">
      <PipelineStagesClient
        organizationId={orgId}
        pipelines={pipelines}
        activePipeline={activePipeline}
        stats={(statsRaw ?? []) as PipelineStageStats[]}
        canEdit={canManagePipelines}
        canDelete={canManagePipelines}
      />
    </div>
  );
}
