import { KanbanBoard } from "@/components/crm/kanban-board";
import { parseDealSort } from "@/lib/features/deal-filters/domain/deal-filters";
import {
  KANBAN_LIMIT,
  loadKanbanDeals,
  readDealDateFilters,
} from "@/lib/features/deal-filters/infrastructure/kanban-deals-query";
import {
  currentMonthStart,
  loadPipelineMonthDeals,
} from "@/lib/features/deal-filters/infrastructure/pipeline-metrics-query";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { Contact, DealTag, Pipeline, Profile } from "@/types";

export const metadata = { title: "Negociações" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;

export default async function NegociacoesPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const { funil, status, responsavel, ordem, tag, q } = params;
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
  // "todas" é o único valor que remove o filtro; ausência de parâmetro = "open"
  const statusFilter = status ?? "open";
  const sort = parseDealSort(ordem);
  const dateFilters = readDealDateFilters((param) => params[param]);
  const search = q?.trim().slice(0, 100) || null;
  // Só um UUID de membro chega à RPC; lixo na URL vira "todos".
  const responsibleFilter = responsavel && /^[0-9a-f-]{36}$/i.test(responsavel) ? responsavel : null;

  const monthStart = currentMonthStart();
  const [kanban, { data: membersRaw }, { data: contactsRaw }, monthDeals] = await Promise.all([
    loadKanbanDeals(supabase, {
      organizationId: orgId,
      pipelineId: activePipeline?.id ?? null,
      status: statusFilter,
      responsibleId: responsibleFilter,
      tagId: tagFilter,
      search,
      sort,
      dateFilters,
    }),
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
    loadPipelineMonthDeals(supabase, orgId, activePipeline?.id ?? null, monthStart),
  ]);

  const members = ((membersRaw ?? []) as unknown as { profile: Profile }[]).map((m) => m.profile);
  const contacts = (contactsRaw ?? []) as Contact[];

  return (
    <div className="animate-fade-up">
      <KanbanBoard
        organizationId={orgId}
        profileId={session.profile.id}
        pipelines={pipelines}
        activePipeline={activePipeline}
        deals={kanban.deals}
        totalDeals={kanban.total}
        dealsLimit={KANBAN_LIMIT}
        sort={sort}
        dateFilters={dateFilters}
        search={search ?? ""}
        members={members}
        contacts={contacts}
        tags={tags}
        tagsError={tagsError ? "Não foi possível carregar as tags e o filtro." : null}
        dealsError={kanban.error}
        canManageOrg={
          session.membership.role === "org_admin" || session.profile.is_global_admin
        }
        monthDeals={monthDeals}
        monthStart={monthStart.toISOString()}
      />
    </div>
  );
}
