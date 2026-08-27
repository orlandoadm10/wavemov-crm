import { DealDetail } from "@/components/crm/deal-detail";
import { WHATSAPP_ACTIVITY_TYPES } from "@/lib/features/deal-history/domain/activity-types";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type {
  ActivityLog,
  Contact,
  Deal,
  LostReason,
  Pipeline,
  Profile,
  Task,
  WhatsAppConversation,
} from "@/types";
import { notFound } from "next/navigation";

export const metadata = { title: "Negociação" };
export const dynamic = "force-dynamic";

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const { data: dealRaw } = await supabase
    .from("deals")
    .select(
      "*, contact:contacts(*), responsible:profiles!deals_responsible_id_fkey(*), lost_reason:lost_reasons(*)"
    )
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!dealRaw) notFound();
  const deal = dealRaw as unknown as Deal;

  const [
    { data: pipelinesRaw },
    { data: membersRaw },
    { data: contactsRaw },
    { data: tasksRaw },
    { data: activitiesRaw, error: activitiesQueryError },
    { data: reasonsRaw },
    { data: conversationsRaw, error: conversationsQueryError },
    { data: submissionRaw },
  ] = await Promise.all([
    supabase
      .from("pipelines")
      .select("*, stages:pipeline_stages(*)")
      .eq("organization_id", orgId)
      .order("created_at"),
    supabase
      .from("organization_members")
      .select("profile:profiles(*)")
      .eq("organization_id", orgId)
      .eq("is_active", true),
    supabase.from("contacts").select("*").eq("organization_id", orgId).order("name").limit(500),
    supabase
      .from("tasks")
      .select("*")
      .eq("organization_id", orgId)
      .eq("deal_id", id)
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("activity_logs")
      .select("*, actor:profiles!activity_logs_actor_id_fkey(*)")
      .eq("organization_id", orgId)
      .eq("deal_id", id)
      .not("type", "in", `(${WHATSAPP_ACTIVITY_TYPES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("lost_reasons").select("*").eq("organization_id", orgId).order("name"),
    supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("organization_id", orgId)
      .eq("deal_id", id)
      .order("last_message_at", { ascending: false }),
    // Respostas do formulário de origem (0015). `form_submissions` não tem
    // `organization_id`: o RLS a isola pela política que atravessa `forms`,
    // e o filtro por `deal_id` já veio de um lead confirmado desta empresa.
    // Só `metadata` é trazido — `raw_data` duplica o que o card Contato já
    // mostra e não precisa atravessar a fronteira para o navegador.
    supabase
      .from("form_submissions")
      .select("metadata, form:forms(external_id)")
      .eq("deal_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (activitiesQueryError) {
    console.error("Falha ao carregar atividades da negociação", {
      organizationId: orgId,
      dealId: id,
      error: activitiesQueryError,
    });
  }
  if (conversationsQueryError) {
    console.error("Falha ao carregar conversas da negociação", {
      organizationId: orgId,
      dealId: id,
      error: conversationsQueryError,
    });
  }

  return (
    <DealDetail
      organizationId={orgId}
      profileId={session.profile.id}
      deal={deal}
      pipelines={(pipelinesRaw ?? []) as Pipeline[]}
      members={((membersRaw ?? []) as unknown as { profile: Profile }[]).map((m) => m.profile)}
      contacts={(contactsRaw ?? []) as Contact[]}
      tasks={(tasksRaw ?? []) as Task[]}
      activities={(activitiesRaw ?? []) as unknown as ActivityLog[]}
      activitiesError={activitiesQueryError ? "Não foi possível carregar as atividades do lead." : null}
      lostReasons={(reasonsRaw ?? []) as LostReason[]}
      conversations={(conversationsRaw ?? []) as WhatsAppConversation[]}
      conversationsError={
        conversationsQueryError ? "Não foi possível carregar as conversas vinculadas." : null
      }
      leadInfo={(submissionRaw as { metadata?: unknown } | null)?.metadata ?? null}
      leadFormExternalId={
        (submissionRaw as unknown as { form?: { external_id: string | null } | null } | null)?.form
          ?.external_id ?? null
      }
      hasSubmission={Boolean(submissionRaw)}
      // `viewer` é somente leitura desde a 0003: vê as informações, mas não
      // recebe o lápis — e a server action recusa por conta própria.
      canEditLeadInfo={session.membership.role !== "viewer"}
    />
  );
}
