import { FormsClient } from "@/components/forms/forms-client";
import { PageHeader } from "@/components/layout/page-header";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { Form, Pipeline, Profile } from "@/types";

export const metadata = { title: "Formulários" };
export const dynamic = "force-dynamic";

export default async function FormulariosPage() {
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const [{ data: formsRaw }, { data: pipelinesRaw }, { data: membersRaw }] = await Promise.all([
    supabase
      .from("forms")
      .select("*, fields:form_fields(*)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("pipelines")
      .select("*, stages:pipeline_stages(*)")
      .eq("organization_id", orgId)
      .order("created_at"),
    supabase
      .from("organization_members")
      .select("profile:profiles(*)")
      .eq("organization_id", orgId)
      .eq("is_active", true),
  ]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Criador de formulários"
        subtitle={`Formulários de captura de leads · ${(formsRaw ?? []).length} criado(s)`}
      />
      <FormsClient
        organizationId={orgId}
        forms={(formsRaw ?? []) as Form[]}
        pipelines={(pipelinesRaw ?? []) as Pipeline[]}
        members={((membersRaw ?? []) as unknown as { profile: Profile }[]).map((m) => m.profile)}
      />
    </div>
  );
}
