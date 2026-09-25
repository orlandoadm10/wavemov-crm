import { PeopleClient } from "@/components/crm/people-client";
import { PageHeader } from "@/components/layout/page-header";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { OrganizationMember } from "@/types";

export const metadata = { title: "Pessoas" };
export const dynamic = "force-dynamic";

export default async function PessoasPage() {
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const [{ data: membersRaw }, { data: dealsRaw }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("*, profile:profiles(*)")
      .eq("organization_id", orgId)
      .order("created_at"),
    supabase
      .from("deals")
      .select("responsible_id")
      .eq("organization_id", orgId)
      .not("responsible_id", "is", null),
  ]);

  const leadCounts: Record<string, number> = {};
  for (const d of dealsRaw ?? []) {
    if (d.responsible_id) {
      leadCounts[d.responsible_id] = (leadCounts[d.responsible_id] ?? 0) + 1;
    }
  }

  const canManage =
    session.profile.is_global_admin || session.membership.role === "org_admin";

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="Organização" title="Pessoas" subtitle="Equipe e permissões da empresa" />
      <PeopleClient
        organizationId={orgId}
        organizationName={session.organization.name}
        members={(membersRaw ?? []) as OrganizationMember[]}
        leadCounts={leadCounts}
        canManage={canManage}
      />
    </div>
  );
}
