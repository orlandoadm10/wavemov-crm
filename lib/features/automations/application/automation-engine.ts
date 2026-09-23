// ============================================================
// Motor de automações.
//
// processCrmEvents: drena a fila `crm_events` (gravada pelas triggers da 0028)
//   → regras ativas do gatilho → filtro de etapa/funil → condições → ações.
// runNoReplyFollowUps: varre conversas em que a última mensagem foi nossa e
//   o lead não respondeu há N horas — a régua de follow-up (passo 1, 2, 3…).
//
// Garantias:
//   * idempotência: `automation_runs (rule_id, dedupe_key)` é único; a mesma
//     regra nunca roda duas vezes para o mesmo evento/passo;
//   * antilaço: uma regra que move etapa gera outro evento; se ela já rodou
//     para o mesmo lead no último minuto, é pulada;
//   * atraso (`trigger_config.delay_minutes`): o evento é reagendado só para
//     aquela regra, sem segurar as outras.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutomationAction, AutomationRule } from "@/types";
import { conditionsMatch, triggerConfigMatches, type RuleCondition } from "../domain/rules";
import { loadAutomationContext } from "../infrastructure/automation-context";
import { executeAction, type ActionOutcome } from "../infrastructure/action-executors";

interface CrmEventRow {
  id: string;
  organization_id: string;
  event_type: string;
  deal_id: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

const LOOP_GUARD_MS = 60_000;

export interface EngineReport {
  events: number;
  runs: number;
  followUps: number;
}

export async function processCrmEvents(
  admin: SupabaseClient,
  opts: { organizationId?: string | null; limit?: number } = {}
): Promise<{ events: number; runs: number }> {
  await admin.rpc("requeue_stale_crm_events", { p_older_than_minutes: 10 });
  const { data, error } = await admin.rpc("claim_crm_events", {
    p_limit: opts.limit ?? 25,
    p_organization_id: opts.organizationId ?? null,
  });
  if (error) {
    console.error("[automations] falha ao reservar eventos", error.message);
    return { events: 0, runs: 0 };
  }

  const events = (data ?? []) as CrmEventRow[];
  const rulesCache = new Map<string, AutomationRule[]>();
  let runs = 0;

  for (const event of events) {
    try {
      const cacheKey = `${event.organization_id}:${event.event_type}`;
      if (!rulesCache.has(cacheKey)) {
        rulesCache.set(cacheKey, await loadActiveRules(admin, event.organization_id, event.event_type));
      }
      // Evento reagendado por atraso vale só para a regra que o reagendou.
      const delayedRuleId = typeof event.payload._rule_id === "string" ? event.payload._rule_id : null;
      const rules = (rulesCache.get(cacheKey) ?? []).filter((r) => !delayedRuleId || r.id === delayedRuleId);

      for (const rule of rules) {
        if (!triggerConfigMatches(rule.trigger_config, event)) continue;

        const delay = Number(rule.trigger_config.delay_minutes ?? 0);
        if (!delayedRuleId && delay > 0) {
          await admin.from("crm_events").insert({
            organization_id: event.organization_id,
            event_type: event.event_type,
            deal_id: event.deal_id,
            contact_id: event.contact_id,
            conversation_id: event.conversation_id,
            payload: { ...event.payload, _rule_id: rule.id, _source_event_id: event.id },
            run_after: new Date(Date.now() + delay * 60_000).toISOString(),
          });
          continue;
        }

        if (await ranRecentlyForDeal(admin, rule.id, event.deal_id)) continue;
        const executed = await runRule(admin, rule, {
          dedupeKey: `event:${(event.payload._source_event_id as string | undefined) ?? event.id}`,
          eventId: event.id,
          dealId: event.deal_id,
          contactId: event.contact_id,
          conversationId: event.conversation_id,
          payload: event.payload,
        });
        if (executed) runs++;
      }

      await admin
        .from("crm_events")
        .update({ status: "done", processed_at: new Date().toISOString(), error: null })
        .eq("id", event.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await admin
        .from("crm_events")
        .update({
          status: event.attempts >= 5 ? "error" : "pending",
          error: message.slice(0, 500),
          run_after: new Date(Date.now() + 60_000 * event.attempts).toISOString(),
        })
        .eq("id", event.id);
    }
  }
  return { events: events.length, runs };
}

export async function runNoReplyFollowUps(
  admin: SupabaseClient,
  opts: { organizationId?: string | null } = {}
): Promise<number> {
  let query = admin
    .from("automation_rules")
    .select("*")
    .eq("trigger_event", "conversation.no_reply")
    .eq("is_active", true);
  if (opts.organizationId) query = query.eq("organization_id", opts.organizationId);
  const { data: rules } = await query;

  let executed = 0;
  for (const rule of (rules ?? []) as AutomationRule[]) {
    const hours = Math.max(1, Number(rule.trigger_config.hours ?? 24));
    const step = Math.max(1, Number(rule.trigger_config.step ?? 1));
    const onlyAi = rule.trigger_config.only_ai === true;
    const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();

    let candidates = admin
      .from("whatsapp_conversations")
      .select("id, deal_id, contact_id, last_message_at")
      .eq("organization_id", rule.organization_id)
      .eq("last_message_direction", "outbound")
      .eq("followup_count", step - 1)
      .in("status", ["open", "pending"])
      .lt("last_message_at", cutoff)
      .order("last_message_at")
      .limit(50);
    if (onlyAi) candidates = candidates.eq("handling_mode", "ai");
    const { data: conversations } = await candidates;

    for (const conversation of conversations ?? []) {
      const ran = await runRule(admin, rule, {
        dedupeKey: `followup:${conversation.id}:${step}:${conversation.last_message_at}`,
        eventId: null,
        dealId: conversation.deal_id,
        contactId: conversation.contact_id,
        conversationId: conversation.id,
        payload: { step, hours },
      });
      // Avança a régua mesmo se a ação falhou: repetir a cada varredura um
      // envio que a Meta recusa (janela fechada) seria spam de erro.
      await admin
        .from("whatsapp_conversations")
        .update({ followup_count: step, last_followup_at: new Date().toISOString() })
        .eq("id", conversation.id)
        .eq("organization_id", rule.organization_id)
        .eq("followup_count", step - 1);
      if (ran) executed++;
    }
  }
  return executed;
}

async function loadActiveRules(admin: SupabaseClient, organizationId: string, eventType: string) {
  const { data } = await admin
    .from("automation_rules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("trigger_event", eventType)
    .eq("is_active", true)
    .order("created_at");
  return (data ?? []) as AutomationRule[];
}

async function ranRecentlyForDeal(admin: SupabaseClient, ruleId: string, dealId: string | null) {
  if (!dealId) return false;
  const { data } = await admin
    .from("automation_runs")
    .select("id")
    .eq("rule_id", ruleId)
    .eq("deal_id", dealId)
    .gte("created_at", new Date(Date.now() - LOOP_GUARD_MS).toISOString())
    .limit(1);
  return Boolean(data && data.length > 0);
}

async function runRule(
  admin: SupabaseClient,
  rule: AutomationRule,
  subject: {
    dedupeKey: string;
    eventId: string | null;
    dealId: string | null;
    contactId: string | null;
    conversationId: string | null;
    payload: Record<string, unknown>;
  }
): Promise<boolean> {
  const { context, conversationId, dealId } = await loadAutomationContext(admin, {
    organizationId: rule.organization_id,
    dealId: subject.dealId,
    contactId: subject.contactId,
    conversationId: subject.conversationId,
    payload: subject.payload,
  });
  if (!conditionsMatch((rule.conditions ?? []) as RuleCondition[], context)) return false;

  // Reserva a execução ANTES de agir: o índice único é a idempotência.
  const { data: run, error: claimError } = await admin
    .from("automation_runs")
    .insert({
      organization_id: rule.organization_id,
      rule_id: rule.id,
      event_id: subject.eventId,
      deal_id: dealId,
      conversation_id: conversationId,
      dedupe_key: subject.dedupeKey,
      status: "skipped",
    })
    .select("id")
    .maybeSingle();
  if (claimError || !run) return false; // 23505 = já executada

  const results: ActionOutcome[] = [];
  for (const action of (rule.actions ?? []) as AutomationAction[]) {
    results.push(
      await executeAction(
        { admin, organizationId: rule.organization_id, ruleName: rule.name, dealId, conversationId, context },
        action
      )
    );
  }

  const failures = results.filter((r) => r.status === "failed").length;
  const successes = results.filter((r) => r.status === "success").length;
  const status = failures === 0 ? (successes > 0 ? "success" : "skipped") : successes > 0 ? "partial" : "failed";

  await Promise.all([
    admin
      .from("automation_runs")
      .update({ status, results, error: results.find((r) => r.error && r.status === "failed")?.error ?? null })
      .eq("id", run.id),
    admin
      .from("automation_rules")
      .update({ run_count: (rule.run_count ?? 0) + 1, last_run_at: new Date().toISOString() })
      .eq("id", rule.id)
      .eq("organization_id", rule.organization_id),
  ]);
  rule.run_count = (rule.run_count ?? 0) + 1;
  return true;
}
