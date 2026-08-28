import { TagsCatalogClient } from "@/components/crm/tags-catalog-client";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { DealTag } from "@/types";
import { redirect } from "next/navigation";

export const metadata = { title: "Tags" };
export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const session = await getSessionContext();
  const canManage = session.membership.role === "org_admin" || session.profile.is_global_admin;
  if (!canManage) redirect("/dashboard");

  const supabase = await createClient();
  const orgId = session.organization.id;
  const { data, error } = await supabase
    .from("deal_tags")
    .select("*")
    .eq("organization_id", orgId)
    .order("is_active", { ascending: false })
    .order("category")
    .order("name");

  if (error) console.error("Falha ao carregar catálogo de tags", { organizationId: orgId, error });

  return (
    <div className="animate-fade-up">
      <TagsCatalogClient
        organizationId={orgId}
        profileId={session.profile.id}
        tags={(data ?? []) as DealTag[]}
        loadError={error ? "Não foi possível carregar o catálogo de tags." : null}
      />
    </div>
  );
}
