import { CompaniesClient } from "@/components/crm/companies-client";
import { PageHeader } from "@/components/layout/page-header";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { daysSince } from "@/lib/utils";

export const metadata = { title: "Empresas" };
export const dynamic = "force-dynamic";

export default async function EmpresasPage() {
  const session = await getSessionContext();
  const supabase = await createClient();

  // RLS: membro vê as próprias organizações; admin global vê todas
  const [{ data: orgs }, { data: dealMeta }] = await Promise.all([
    supabase.from("organizations").select("*").order("updated_at", { ascending: false }),
    supabase
      .from("deals")
      .select("organization_id, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5000),
  ]);

  const leadsByOrg = new Map<string, { count: number; lastUpdate: string }>();
  for (const d of dealMeta ?? []) {
    const cur = leadsByOrg.get(d.organization_id) ?? { count: 0, lastUpdate: d.updated_at };
    cur.count += 1;
    if (d.updated_at > cur.lastUpdate) cur.lastUpdate = d.updated_at;
    leadsByOrg.set(d.organization_id, cur);
  }

  const rows = (orgs ?? []).map((o) => {
    const meta = leadsByOrg.get(o.id);
    return {
      ...o,
      leads: meta?.count ?? 0,
      inactivityDays: meta ? daysSince(meta.lastUpdate) : null,
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
