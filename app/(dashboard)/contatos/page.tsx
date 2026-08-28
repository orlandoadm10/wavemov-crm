import { ContactsClient } from "@/components/crm/contacts-client";
import { PageHeader } from "@/components/layout/page-header";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { Contact, Deal } from "@/types";

export const metadata = { title: "Contatos" };
export const dynamic = "force-dynamic";

export default async function ContatosPage() {
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const [{ data: contacts }, { data: deals }] = await Promise.all([
    supabase
      .from("contacts")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("deals")
      .select("id, contact_id, status, value, pipeline_id, stage_id, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Contatos" subtitle="Base de clientes e leads da empresa" />
      <ContactsClient
        organizationId={orgId}
        contacts={(contacts ?? []) as Contact[]}
        deals={(deals ?? []) as unknown as Deal[]}
        canEdit={session.membership.role !== "viewer"}
      />
    </div>
  );
}
