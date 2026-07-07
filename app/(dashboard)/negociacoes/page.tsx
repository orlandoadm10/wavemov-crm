import { KanbanBoard } from "@/components/crm/kanban-board";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { Contact, Deal, Pipeline, Profile } from "@/types";

export const metadata = { title: "Negociações" };
export const dynamic = "force-dynamic";

type Search = Promise<{
  funil?: string;
  status?: string;
  responsavel?: string;
  ordem?: string;
}>;

export default async function NegociacoesPage({ searchParams }: { searchParams: Search }) {
  const { funil, status, responsavel, ordem } = await searchParams;
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const { data: pipelinesRaw } = await supabase
    .from("pipelines")
    .select("*, stages:pipeline_stages(*)")
    .eq("organization_id", orgId)
    .order("created_at");

  const pipelines = (pipelinesRaw ?? []) as Pipeline[];
  const activePipeline = pipelines.find((p) => p.id === funil) ?? pipelines[0] ?? null;

  let dealsQuery = supabase
    .from("deals")
    .select("*, contact:contacts(*), responsible:profiles!deals_responsible_id_fkey(*)")
    .eq("organization_id", orgId);

  if (activePipeline) dealsQuery = dealsQuery.eq("pipeline_id", activePipeline.id);

  const statusFilter = status ?? "open";
  if (statusFilter) dealsQuery = dealsQuery.eq("status", statusFilter);
  if (responsavel) dealsQuery = dealsQuery.eq("responsible_id", responsavel);

  if (ordem === "antigas") dealsQuery = dealsQuery.order("created_at", { ascending: true });
  else if (ordem === "valor") dealsQuery = dealsQuery.order("value", { ascending: false });
  else dealsQuery = dealsQuery.order("created_at", { ascending: false });

  const [{ data: dealsRaw }, { data: membersRaw }, { data: contactsRaw }] = await Promise.all([
    dealsQuery.limit(500),
    supabase
      .from("organization_members")
      .select("profile:profiles(*)")
      .eq("organization_id", orgId)
      .eq("is_active", true),
    supabase
      .from("contacts")
      .select("*")
      .eq("organization_id", orgId)
      .order("name")
      .limit(500),
  ]);

  const deals = (dealsRaw ?? []) as unknown as Deal[];
  const members = ((membersRaw ?? []) as unknown as { profile: Profile }[]).map((m) => m.profile);
  const contacts = (contactsRaw ?? []) as Contact[];

  return (
    <div className="animate-fade-up">
      <KanbanBoard
        organizationId={orgId}
        profileId={session.profile.id}
        pipelines={pipelines}
        activePipeline={activePipeline}
        deals={deals}
        members={members}
        contacts={contacts}
      />
    </div>
  );
}
