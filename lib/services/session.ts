import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Organization, OrganizationMember, Profile, SessionContext } from "@/types";

export const ACTIVE_ORG_COOKIE = "wavemov-active-org";

// Carrega o contexto completo da sessão: perfil, organização ativa e memberships.
// Admin global pode "logar" em qualquer organização via cookie.
export async function getSessionContext(): Promise<SessionContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single<Profile>();

  if (!profile) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("*, organization:organizations(*)")
    .eq("profile_id", profile.id)
    .eq("is_active", true)
    .order("created_at");

  let organizations: Organization[] =
    (memberships ?? [])
      .map((m) => (m as OrganizationMember).organization)
      .filter(Boolean) as Organization[];

  // Admin global enxerga todas as organizações
  if (profile.is_global_admin) {
    const { data: allOrgs } = await supabase
      .from("organizations")
      .select("*")
      .order("name");
    if (allOrgs) organizations = allOrgs as Organization[];
  }

  // Usuário sem organização → onboarding
  if (organizations.length === 0) redirect("/onboarding");

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  // Prioridade: cookie → organização mais antiga onde é membro → primeira visível
  const firstMembershipOrgId = ((memberships ?? []) as OrganizationMember[])[0]
    ?.organization_id;
  const organization =
    organizations.find((o) => o.id === activeOrgId) ??
    organizations.find((o) => o.id === firstMembershipOrgId) ??
    organizations[0];

  const membership =
    ((memberships ?? []) as OrganizationMember[]).find(
      (m) => m.organization_id === organization.id
    ) ??
    ({
      id: "global-admin",
      organization_id: organization.id,
      profile_id: profile.id,
      role: "org_admin",
      is_active: true,
      created_at: new Date().toISOString(),
    } as OrganizationMember);

  return { profile, organization, membership, organizations };
}
