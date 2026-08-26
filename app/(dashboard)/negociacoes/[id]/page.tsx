import { DealDetail } from "@/components/crm/deal-detail";
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
    { data: activitiesRaw },
    { data: reasonsRaw },
    { data: conversationsRaw },
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
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("lost_reasons").select("*").eq("organization_id", orgId).order("name"),
    supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("organization_id", orgId)
      .eq("deal_id", id)
      .order("last_message_at", { ascending: false }),
  ]);

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
      lostReasons={(reasonsRaw ?? []) as LostReason[]}
      conversations={(conversationsRaw ?? []) as WhatsAppConversation[]}
    />
  );
}
