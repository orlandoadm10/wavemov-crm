import { KanbanBoard } from "@/components/crm/kanban-board";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { Contact, Deal, DealTag, Pipeline, Profile } from "@/types";

export const metadata = { title: "Negociações" };
export const dynamic = "force-dynamic";

type Search = Promise<{
  funil?: string;
  status?: string;
  responsavel?: string;
  ordem?: string;
  tag?: string;
}>;

export default async function NegociacoesPage({ searchParams }: { searchParams: Search }) {
  const { funil, status, responsavel, ordem, tag } = await searchParams;
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const [{ data: pipelinesRaw }, { data: tagsRaw, error: tagsError }] = await Promise.all([
    supabase
      .from("pipelines")
      .select("*, stages:pipeline_stages(*)")
      .eq("organization_id", orgId)
      .order("created_at"),
    supabase
      .from("deal_tags")
      .select("*")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("category")
      .order("name"),
  ]);

  const pipelines = (pipelinesRaw ?? []) as Pipeline[];
  const tags = (tagsRaw ?? []) as DealTag[];
  const activePipeline = pipelines.find((p) => p.id === funil) ?? pipelines[0] ?? null;

  // Só aceita ids do catálogo ativo desta organização. Um UUID arbitrário ou
  // de outra empresa não chega ao filtro UUID do PostgREST nem esvazia o board.
  const tagFilter = tag && tags.some((item) => item.id === tag) ? tag : null;
  const tagRelations = [
    "tag_assignments:deal_tag_assignments(deal_id,tag_id,organization_id,assigned_by,assigned_at,tag:deal_tags(*))",
    tagFilter ? "tag_filter:deal_tag_assignments!inner(tag_id)" : null,
  ].filter(Boolean).join(", ");
  let dealsQuery = supabase
    .from("deals")
    .select(`*, contact:contacts(*), responsible:profiles!deals_responsible_id_fkey(*), ${tagRelations}`)
    .eq("organization_id", orgId);

  if (activePipeline) dealsQuery = dealsQuery.eq("pipeline_id", activePipeline.id);

  // "todas" é o único valor que remove o filtro; ausência de parâmetro = "open"
  const statusFilter = status ?? "open";
  if (statusFilter !== "todas") dealsQuery = dealsQuery.eq("status", statusFilter);
  if (responsavel) dealsQuery = dealsQuery.eq("responsible_id", responsavel);
  if (tagFilter) dealsQuery = dealsQuery.eq("tag_filter.tag_id", tagFilter);

  if (ordem === "antigas") dealsQuery = dealsQuery.order("created_at", { ascending: true });
  else if (ordem === "valor") dealsQuery = dealsQuery.order("value", { ascending: false });
  else dealsQuery = dealsQuery.order("created_at", { ascending: false });

  const [{ data: dealsRaw, error: dealsError }, { data: membersRaw }, { data: contactsRaw }] = await Promise.all([
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
        tags={tags}
        tagsError={tagsError ? "Não foi possível carregar as tags e o filtro." : null}
        dealsError={dealsError ? "Não foi possível carregar as negociações." : null}
      />
    </div>
  );
}
