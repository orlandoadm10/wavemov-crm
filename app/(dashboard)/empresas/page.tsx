import { CompaniesClient } from "@/components/crm/companies-client";
import { PageHeader } from "@/components/layout/page-header";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { daysSince } from "@/lib/utils";
import type { OrgDealStats } from "@/types";

type OrgStatsRow = Pick<OrgDealStats, "organization_id" | "deals_total" | "last_activity_at">;

export const metadata = { title: "Empresas" };
export const dynamic = "force-dynamic";

export default async function EmpresasPage() {
  const session = await getSessionContext();
  const supabase = await createClient();

  // RLS: membro vê as próprias organizações; admin global vê todas.
  // A contagem vem da view agregada (0009) — uma linha por empresa, não uma
  // linha por negociação.
  const [{ data: orgs }, { data: statsRaw }] = await Promise.all([
    supabase.from("organizations").select("*").order("updated_at", { ascending: false }),
    supabase
      .from("organization_deal_stats")
      .select("organization_id, deals_total, last_activity_at"),
  ]);

  const statsByOrg = new Map(
    ((statsRaw ?? []) as OrgStatsRow[]).map((s) => [s.organization_id, s])
  );

  const rows = (orgs ?? []).map((o) => {
    const stats = statsByOrg.get(o.id);
    return {
      ...o,
      leads: stats?.deals_total ?? 0,
      inactivityDays: stats?.last_activity_at ? daysSince(stats.last_activity_at) : null,
    };
  });

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Empresas"
        subtitle="Organizações cadastradas na plataforma"
      />
      <CompaniesClient
        organizations={rows}
        isGlobalAdmin={session.profile.is_global_admin}
        activeOrgId={session.organization.id}
      />
    </div>
  );
}
