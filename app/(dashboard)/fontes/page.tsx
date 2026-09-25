import { PageHeader } from "@/components/layout/page-header";
import { AdminOnlyNotice } from "@/components/lead-sources/admin-only-notice";
import { LeadSourcesClient } from "@/components/lead-sources/lead-sources-client";
import type { LeadSourceSummary, PipelineOption } from "@/components/lead-sources/types";
import { isLeadSourceProvider } from "@/lib/features/lead-sources/domain/providers";
import { describeSourceStatus } from "@/lib/features/lead-sources/domain/source-status";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Fontes de lead" };
export const dynamic = "force-dynamic";

type Relation<T> = T | T[] | null;
const one = <T,>(value: Relation<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

export default async function FontesPage() {
  const session = await getSessionContext();
  const canManage = session.membership.role === "org_admin" || session.profile.is_global_admin;
  if (!canManage) return <AdminOnlyNotice />;

  const supabase = await createClient();
  const orgId = session.organization.id;

  const [sourcesResult, formsResult, pipelinesResult, membersResult] = await Promise.all([
    supabase
      .from("lead_sources")
      .select(
        "id, name, provider, is_active, last_event_at, form:forms!lead_sources_form_same_org_fkey(name, pipeline:pipelines(name)), events:lead_source_events(status, received_at)"
      )
      .eq("organization_id", orgId)
      .order("received_at", { referencedTable: "lead_source_events", ascending: false })
      .limit(1, { referencedTable: "lead_source_events" })
      .order("created_at", { ascending: false }),
    supabase
      .from("forms")
      .select("id, name, pipeline:pipelines(name)")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("pipelines")
      .select("id, name, is_default, stages:pipeline_stages(id, name, order_index, is_won_stage, is_lost_stage)")
      .eq("organization_id", orgId)
      .order("created_at"),
    supabase
      .from("organization_members")
      .select("profile:profiles(id, first_name, last_name)")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .in("role", ["org_admin", "seller", "agent"]),
  ]);

  const sources: LeadSourceSummary[] = (sourcesResult.data ?? [])
    .filter((row) => isLeadSourceProvider(row.provider))
    .map((row) => {
      const form = one(row.form as Relation<{ name: string; pipeline: Relation<{ name: string }> }>);
      const lastEvent = (row.events as { status: "processed" | "duplicate" | "failed" }[] | null)?.[0];
      return {
        id: row.id,
        name: row.name,
        provider: row.provider,
        formName: form?.name ?? "—",
        pipelineName: one(form?.pipeline ?? null)?.name ?? null,
        status: describeSourceStatus({
          isActive: row.is_active,
          lastEventAt: row.last_event_at,
          lastStatus: lastEvent?.status ?? null,
        }),
      };
    });

  const pipelines: PipelineOption[] = (pipelinesResult.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    isDefault: p.is_default,
    stages: (p.stages ?? [])
      .filter((s) => !s.is_won_stage && !s.is_lost_stage)
      .sort((a, b) => a.order_index - b.order_index)
      .map((s) => ({ id: s.id, name: s.name })),
  }));

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Fontes de lead"
        subtitle="Conecte Typeform, seu site e outras ferramentas direto ao funil, sem automação no meio"
      />
      <LeadSourcesClient
        sources={sources}
        loadError={!!sourcesResult.error}
        destinationForms={(formsResult.data ?? []).map((f) => ({
          id: f.id,
          name: f.name,
          pipelineName: one(f.pipeline as Relation<{ name: string }>)?.name ?? null,
        }))}
        pipelines={pipelines}
        members={(membersResult.data ?? [])
          .map((m) => one(m.profile as Relation<{ id: string; first_name: string; last_name: string }>))
          .filter((p): p is { id: string; first_name: string; last_name: string } => !!p)
          .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`.trim() || "Sem nome" }))}
      />
    </div>
  );
}
