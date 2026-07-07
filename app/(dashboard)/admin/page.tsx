import { AdminClient } from "@/components/crm/admin-client";
import { PageHeader } from "@/components/layout/page-header";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { Organization, OrganizationMember } from "@/types";
import { redirect } from "next/navigation";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSessionContext();
  if (!session.profile.is_global_admin) redirect("/dashboard");

  const supabase = await createClient();

  // Admin global: RLS permite ver todos os membros e organizações
  const [{ data: membershipsRaw }, { data: orgsRaw }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("*, profile:profiles(*), organization:organizations(*)")
      .order("created_at", { ascending: false }),
    supabase.from("organizations").select("*").order("name"),
  ]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Administração"
        subtitle="Gestão global de usuários, organizações e permissões"
      />
      <AdminClient
        memberships={(membershipsRaw ?? []) as OrganizationMember[]}
        organizations={(orgsRaw ?? []) as Organization[]}
      />
    </div>
  );
}
