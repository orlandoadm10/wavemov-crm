import { WhatsAppClient } from "@/components/whatsapp/whatsapp-client";
import { getInstanceForOrg, toPublicInstance } from "@/lib/services/whatsapp";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { Deal, Profile, QuickReply, WhatsAppConversation } from "@/types";

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

  const [instance, { data: conversationsRaw }, { data: quickRepliesRaw }, { data: membersRaw }, { data: dealsRaw }] =
    await Promise.all([
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
        .select("id, title, value, status, responsible_id, organization_id, pipeline_id, stage_id, temperature, ai_status, created_at, updated_at")
        .eq("organization_id", orgId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

  return (
    <div className="animate-fade-up">
      <WhatsAppClient
        organizationId={orgId}
        profileId={session.profile.id}
        canViewAllConversations={canViewAllConversations}
        instance={toPublicInstance(instance)}
        conversations={(conversationsRaw ?? []) as WhatsAppConversation[]}
        quickReplies={(quickRepliesRaw ?? []) as QuickReply[]}
        members={((membersRaw ?? []) as unknown as { profile: Profile }[]).map((m) => m.profile)}
        deals={(dealsRaw ?? []) as unknown as Deal[]}
        initialConversationId={conversa}
        initialPhone={telefone}
      />
    </div>
  );
}
