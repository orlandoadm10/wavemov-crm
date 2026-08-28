import { WhatsAppClient } from "@/components/whatsapp/whatsapp-client";
import { getInstanceForOrg, toPublicInstance } from "@/lib/services/whatsapp";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { Deal, DealTag, Pipeline, Profile, QuickReply, WhatsAppConversation } from "@/types";

const DEAL_COLUMNS =
  "id, title, value, status, responsible_id, organization_id, pipeline_id, stage_id, temperature, ai_status, created_at, updated_at, tag_assignments:deal_tag_assignments(deal_id,tag_id,organization_id,assigned_by,assigned_at,tag:deal_tags(*))";

export const metadata = { title: "Atendimento" };
export const dynamic = "force-dynamic";

type Search = Promise<{ conversa?: string; telefone?: string }>;

export default async function AtendimentoPage({ searchParams }: { searchParams: Search }) {
  const { conversa, telefone } = await searchParams;
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;
  const canViewAllConversations =
    session.profile.is_global_admin ||
    session.membership.role === "org_admin" ||
    session.membership.role === "viewer";

  const [
    instance,
    { data: conversationsRaw, error: conversationsError },
    { data: quickRepliesRaw },
    { data: membersRaw },
    { data: dealsRaw, error: dealsError },
    { data: pipelinesRaw, error: pipelinesError },
    { data: tagsRaw, error: tagsError },
  ] = await Promise.all([
      getInstanceForOrg(orgId),
      supabase
        .from("whatsapp_conversations")
        .select("*")
        .eq("organization_id", orgId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(300),
      supabase.from("quick_replies").select("*").eq("organization_id", orgId).order("title"),
      supabase
        .from("organization_members")
        .select("profile:profiles(*)")
        .eq("organization_id", orgId)
        .eq("is_active", true),
      supabase
        .from("deals")
        .select(DEAL_COLUMNS)
        .eq("organization_id", orgId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(300),
      // Funis com etapas alimentam o seletor do painel de atendimento.
      supabase
        .from("pipelines")
        .select("*, stages:pipeline_stages(*)")
        .eq("organization_id", orgId)
        .order("created_at"),
      supabase
        .from("deal_tags")
        .select("*")
        .eq("organization_id", orgId)
        .order("is_active", { ascending: false })
        .order("category")
        .order("name"),
    ]);

  // Consulta que falha devolve lista vazia, e lista vazia é indistinguível de
  // "não há nada". O log é o que separa os dois casos no diagnóstico.
  if (conversationsError) console.error("Falha ao carregar conversas", conversationsError);
  if (dealsError) console.error("Falha ao carregar negociações", dealsError);
  if (pipelinesError) console.error("Falha ao carregar funis", pipelinesError);
  if (tagsError) console.error("Falha ao carregar tags no atendimento", tagsError);

  const conversations = (conversationsRaw ?? []) as WhatsAppConversation[];
  const openDeals = (dealsRaw ?? []) as unknown as Deal[];

  // A lista acima só traz negociações abertas (e no máximo 300). Uma conversa
  // cujo lead foi ganho, perdido ou arquivado ficava sem o objeto do lead, e o
  // painel oferecia "Criar lead desta conversa" para quem JÁ tem `deal_id` — o
  // clique criava um lead duplicado e sobrescrevia o vínculo da conversa.
  const jaCarregados = new Set(openDeals.map((d) => d.id));
  const faltantes = [
    ...new Set(
      conversations
        .map((c) => c.deal_id)
        .filter((id): id is string => Boolean(id) && !jaCarregados.has(id as string))
    ),
  ];

  // Em lotes: 300 UUIDs num `id=in.(…)` passam de 11 KB de linha de requisição
  // e o proxy à frente do PostgREST responde 414. O erro precisa aparecer no
  // log — descartá-lo faria a correção acima sumir sem deixar rastro.
  const LOTE = 100;
  const lotes: string[][] = [];
  for (let i = 0; i < faltantes.length; i += LOTE) lotes.push(faltantes.slice(i, i + LOTE));

  const respostas = await Promise.all(
    lotes.map((lote) =>
      supabase.from("deals").select(DEAL_COLUMNS).eq("organization_id", orgId).in("id", lote)
    )
  );
  const linkedDeals = respostas.flatMap((r) => {
    if (r.error) console.error("Falha ao carregar leads vinculados às conversas", r.error);
    return (r.data ?? []) as unknown as Deal[];
  });

  return (
    <div className="animate-fade-up">
      <WhatsAppClient
        organizationId={orgId}
        profileId={session.profile.id}
        canViewAllConversations={canViewAllConversations}
        instance={toPublicInstance(instance)}
        conversations={conversations}
        quickReplies={(quickRepliesRaw ?? []) as QuickReply[]}
        members={((membersRaw ?? []) as unknown as { profile: Profile }[]).map((m) => m.profile)}
        deals={openDeals}
        linkedDeals={linkedDeals}
        pipelines={(pipelinesRaw ?? []) as Pipeline[]}
        tags={(tagsRaw ?? []) as DealTag[]}
        tagsError={tagsError ? "Não foi possível carregar as tags." : null}
        canManageDeal={session.membership.role !== "viewer"}
        initialConversationId={conversa}
        initialPhone={telefone}
      />
    </div>
  );
}
