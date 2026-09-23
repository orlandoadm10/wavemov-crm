// ============================================================
// Monta o contexto que as condições avaliam e as mensagens interpolam:
// lead, contato, etapa, responsável, conversa, tags, empresa e o evento.
// service_role — organização sempre filtrada.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AutomationSubject {
  organizationId: string;
  dealId: string | null;
  contactId: string | null;
  conversationId: string | null;
  payload: Record<string, unknown>;
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const firstName = (name: unknown) => (typeof name === "string" ? name.trim().split(/\s+/)[0] ?? "" : "");

export async function loadAutomationContext(
  admin: SupabaseClient,
  subject: AutomationSubject
): Promise<{ context: Record<string, unknown>; conversationId: string | null; dealId: string | null }> {
  const { organizationId } = subject;
  const context: Record<string, unknown> = { event: subject.payload };
  let dealId = subject.dealId;
  let contactId = subject.contactId;
  let conversationId = subject.conversationId;

  const { data: org } = await admin.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  context.organization = { name: org?.name ?? "" };

  if (dealId) {
    const { data: deal } = await admin
      .from("deals")
      .select(
        "id, title, value, status, source, temperature, ai_status, pipeline_id, stage_id, contact_id, responsible_id, utm_source, utm_campaign, stage:pipeline_stages(id, name), responsible:profiles!deals_responsible_id_fkey(first_name, last_name), tags:deal_tag_assignments(tag:deal_tags(name))"
      )
      .eq("id", dealId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (deal) {
      const tags = ((deal.tags as { tag: { name: string } | { name: string }[] | null }[] | null) ?? [])
        .map((t) => one(t.tag)?.name)
        .filter((n): n is string => Boolean(n));
      context.deal = { ...deal, tags, stage: undefined, responsible: undefined };
      context.stage = one(deal.stage as unknown as { id: string; name: string } | null);
      const responsible = one(deal.responsible as unknown as { first_name: string; last_name: string } | null);
      context.responsible = responsible ? { ...responsible } : null;
      contactId = contactId ?? (deal.contact_id as string | null);
    } else {
      dealId = null;
    }
  }

  if (contactId) {
    const { data: contact } = await admin
      .from("contacts")
      .select("id, name, email, phone, whatsapp_phone, city, state")
      .eq("id", contactId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (contact) context.contact = { ...contact, first_name: firstName(contact.name) };
  }

  if (!conversationId && dealId) {
    const { data } = await admin
      .from("whatsapp_conversations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("deal_id", dealId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1);
    conversationId = data?.[0]?.id ?? null;
  }
  if (conversationId) {
    const { data: conversation } = await admin
      .from("whatsapp_conversations")
      .select("id, phone, status, handling_mode, followup_count, last_inbound_at")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    context.conversation = conversation ?? null;
    if (!conversation) conversationId = null;
  }

  if (typeof subject.payload.content === "string") {
    context.message = { content: subject.payload.content };
  }

  return { context, conversationId, dealId };
}
