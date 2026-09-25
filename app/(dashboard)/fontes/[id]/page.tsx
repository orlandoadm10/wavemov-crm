import { AdminOnlyNotice } from "@/components/lead-sources/admin-only-notice";
import { FieldMappingCard } from "@/components/lead-sources/field-mapping-card";
import { ProviderIcon } from "@/components/lead-sources/provider-visual";
import { SourceConnectionCard } from "@/components/lead-sources/source-connection-card";
import { SourceEventsCard } from "@/components/lead-sources/source-events-card";
import { SourceSettingsCard } from "@/components/lead-sources/source-settings-card";
import type { SourceEventView } from "@/components/lead-sources/types";
import { Badge } from "@/components/ui/badge";
import { collectReceivedFields, guessIdentity } from "@/lib/features/lead-sources/domain/field-mapping";
import type { InboundField } from "@/lib/features/lead-sources/domain/inbound-payload";
import { isLeadSourceProvider, PROVIDERS } from "@/lib/features/lead-sources/domain/providers";
import { describeSourceStatus } from "@/lib/features/lead-sources/domain/source-status";
import { findSourceTokens } from "@/lib/features/lead-sources/infrastructure/lead-source-queries";
import { getSessionContext } from "@/lib/services/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = { title: "Fonte de lead" };
export const dynamic = "force-dynamic";

type Relation<T> = T | T[] | null;
const one = <T,>(value: Relation<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

interface FormRow {
  id: string;
  name: string;
  is_active: boolean;
  pipeline: Relation<{ name: string }>;
  stage: Relation<{ name: string }>;
  fields: { label: string; field_key: string; field_type: string; order_index: number }[] | null;
}

/** Nome do lead numa entrega, para a lista ser reconhecível; senão o 1º valor. */
function leadLabel(fields: InboundField[]): string | null {
  return (fields.find((f) => guessIdentity(f) === "name") ?? fields[0])?.value ?? null;
}

export default async function FonteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionContext();
  const canManage = session.membership.role === "org_admin" || session.profile.is_global_admin;
  if (!canManage) return <AdminOnlyNotice />;

  const orgId = session.organization.id;
  const supabase = await createClient();

  const [{ data: source }, { data: eventsRaw }] = await Promise.all([
    supabase
      .from("lead_sources")
      .select(
        "id, name, provider, is_active, last_event_at, field_mapping, form:forms!lead_sources_form_same_org_fkey(id, name, is_active, pipeline:pipelines(name), stage:pipeline_stages(name), fields:form_fields(label, field_key, field_type, order_index))"
      )
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("lead_source_events")
      .select("id, received_at, status, error, deal_id, deduplicated, fields")
      .eq("lead_source_id", id)
      .eq("organization_id", orgId)
      .order("received_at", { ascending: false })
      .limit(30),
  ]);

  if (!source || !isLeadSourceProvider(source.provider)) notFound();
  const form = one(source.form as Relation<FormRow>);
  if (!form) notFound();

  // O token só é lido depois da guarda de papel acima (0032).
  const token = (await findSourceTokens(createAdminClient(), orgId)).get(source.id) ?? null;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  const targets = (form.fields ?? [])
    .sort((a, b) => a.order_index - b.order_index)
    .map((f) => ({ field_key: f.field_key, label: f.label, field_type: f.field_type }));
  const mapping = (source.field_mapping ?? {}) as Record<string, string>;

  const events: SourceEventView[] = (eventsRaw ?? []).map((e) => {
    const fields = (e.fields ?? []) as InboundField[];
    return {
      id: e.id,
      receivedAt: e.received_at,
      status: e.status,
      error: e.error,
      dealId: e.deal_id,
      deduplicated: e.deduplicated,
      leadLabel: leadLabel(fields),
      fields,
    };
  });

  const status = describeSourceStatus({
    isActive: source.is_active,
    lastEventAt: source.last_event_at,
    lastStatus: events[0]?.status ?? null,
  });

  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <Link
          href="/fontes"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> Fontes de lead
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <ProviderIcon provider={source.provider} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-ink">{source.name}</h1>
            <p className="text-sm text-ink-faint">
              {PROVIDERS[source.provider].label} → {one(form.pipeline)?.name ?? "sem funil"}
              {one(form.stage) ? ` · ${one(form.stage)?.name}` : ""}
            </p>
          </div>
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SourceConnectionCard
            provider={source.provider}
            url={token ? `${appUrl}/api/inbound/${token}` : null}
            waiting={source.is_active && !source.last_event_at}
          />
        </div>
        <SourceSettingsCard
          sourceId={source.id}
          name={source.name}
          isActive={source.is_active}
          form={{ name: form.name, isActive: form.is_active }}
        />
      </div>

      <FieldMappingCard
        sourceId={source.id}
        rows={collectReceivedFields(
          events.map((e) => e.fields),
          mapping,
          targets
        )}
        savedMapping={mapping}
        targets={targets.map((t) => ({ fieldKey: t.field_key, label: t.label }))}
        formName={form.name}
      />

      <SourceEventsCard events={events} />
    </div>
  );
}
