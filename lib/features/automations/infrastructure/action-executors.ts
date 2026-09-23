// ============================================================
// Executores das ações de automação. Cada um recebe o contexto já montado e a
// configuração validada da ação, e devolve sucesso/falha/pulado — nunca lança.
// service_role: toda escrita filtra organização e confere o alvo.
// ============================================================
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sendConversationMessage } from "@/lib/features/channels/application/send-conversation-message";
import {
  addDealNote,
  createDealTask,
  loadDeal,
  loadPipelineStages,
  moveDealToStage,
} from "@/lib/features/crm-tools/infrastructure/lead-commands";
import { renderTemplate, type ActionType } from "../domain/rules";

export interface ActionContext {
  admin: SupabaseClient;
  organizationId: string;
  ruleName: string;
  dealId: string | null;
  conversationId: string | null;
  context: Record<string, unknown>;
}

export interface ActionOutcome {
  type: string;
  status: "success" | "failed" | "skipped";
  error?: string;
}

const LABEL = "Automação";

const schemas = {
  send_whatsapp: z.object({
    text: z.string().trim().min(1).max(4000),
    template_name: z.string().trim().max(120).optional(),
    template_language: z.string().trim().max(10).optional(),
  }),
  move_stage: z.object({ stage_id: z.string().uuid() }),
  assign_owner: z.object({ profile_id: z.string().uuid() }),
  add_tag: z.object({ tag_id: z.string().uuid() }),
  create_task: z.object({
    title: z.string().trim().min(2).max(200),
    due_in_hours: z.coerce.number().min(0).max(24 * 90).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
  }),
  add_note: z.object({ text: z.string().trim().min(1).max(4000) }),
  set_temperature: z.object({ temperature: z.enum(["cold", "warm", "hot"]) }),
  set_handling_mode: z.object({ mode: z.enum(["ai", "human"]) }),
  call_webhook: z.object({ url: z.string().url().max(500), secret: z.string().max(200).optional() }),
} satisfies Record<ActionType, z.ZodTypeAny>;

export function validateActionConfig(type: string, config: unknown) {
  const schema = schemas[type as ActionType];
  if (!schema) return { ok: false as const, error: `Ação desconhecida: ${type}` };
  const parsed = schema.safeParse(config ?? {});
  return parsed.success
    ? { ok: true as const, config: parsed.data }
    : { ok: false as const, error: parsed.error.issues[0]?.message ?? "Configuração inválida." };
}

const skipped = (type: string, error: string): ActionOutcome => ({ type, status: "skipped", error });
const failed = (type: string, error: string): ActionOutcome => ({ type, status: "failed", error });
const success = (type: string): ActionOutcome => ({ type, status: "success" });

export async function executeAction(
  ctx: ActionContext,
  action: { type: string; config: Record<string, unknown> }
): Promise<ActionOutcome> {
  const validated = validateActionConfig(action.type, action.config);
  if (!validated.ok) return failed(action.type, validated.error);
  const config = validated.config as Record<string, unknown>;
  const { admin, organizationId } = ctx;

  try {
    switch (action.type as ActionType) {
      case "send_whatsapp": {
        if (!ctx.conversationId) return skipped(action.type, "Lead sem conversa de WhatsApp.");
        const text = renderTemplate(String(config.text), ctx.context);
        if (!text) return skipped(action.type, "Mensagem vazia após as variáveis.");
        const template = config.template_name
          ? {
              name: String(config.template_name),
              language: String(config.template_language || "pt_BR"),
              bodyParams: [],
            }
          : undefined;
        const sent = await sendConversationMessage(admin, {
          organizationId,
          conversationId: ctx.conversationId,
          text,
          senderType: "automation",
          template,
        });
        return sent.ok ? success(action.type) : failed(action.type, sent.error);
      }

      case "move_stage": {
        const deal = ctx.dealId ? await loadDeal(admin, organizationId, ctx.dealId) : null;
        if (!deal) return skipped(action.type, "Evento sem lead.");
        const stages = await loadPipelineStages(admin, organizationId, deal.pipeline_id);
        const stage = stages.find((s) => s.id === config.stage_id);
        if (!stage) return failed(action.type, "Etapa não pertence ao funil do lead.");
        const moved = await moveDealToStage(admin, deal, stage, { label: `${LABEL} "${ctx.ruleName}"` });
        return moved.ok ? success(action.type) : failed(action.type, moved.error);
      }

      case "assign_owner": {
        if (!ctx.dealId) return skipped(action.type, "Evento sem lead.");
        // O responsável precisa ser membro ativo DESTA empresa.
        const { data: member } = await admin
          .from("organization_members")
          .select("profile_id")
          .eq("organization_id", organizationId)
          .eq("profile_id", config.profile_id)
          .eq("is_active", true)
          .maybeSingle();
        if (!member) return failed(action.type, "Responsável não é membro ativo da empresa.");
        const { data } = await admin
          .from("deals")
          .update({ responsible_id: config.profile_id })
          .eq("id", ctx.dealId)
          .eq("organization_id", organizationId)
          .select("id")
          .maybeSingle();
        return data ? success(action.type) : failed(action.type, "Lead não encontrado.");
      }

      case "add_tag": {
        if (!ctx.dealId) return skipped(action.type, "Evento sem lead.");
        const { data: tag } = await admin
          .from("deal_tags")
          .select("id, is_active")
          .eq("id", config.tag_id)
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (!tag?.is_active) return failed(action.type, "Tag inexistente ou inativa.");
        // A FK composta da 0019 impede vínculo entre empresas mesmo com service_role.
        const { error } = await admin
          .from("deal_tag_assignments")
          .upsert(
            { deal_id: ctx.dealId, tag_id: tag.id, organization_id: organizationId },
            { onConflict: "deal_id,tag_id", ignoreDuplicates: true }
          );
        return error ? failed(action.type, error.message) : success(action.type);
      }

      case "create_task": {
        const deal = ctx.dealId ? await loadDeal(admin, organizationId, ctx.dealId) : null;
        if (!deal) return skipped(action.type, "Evento sem lead.");
        const task = await createDealTask(admin, deal, {
          title: renderTemplate(String(config.title), ctx.context),
          dueInHours: (config.due_in_hours as number | undefined) ?? null,
          priority: config.priority as "low" | "medium" | "high" | undefined,
        });
        return task ? success(action.type) : failed(action.type, "Falha ao criar a tarefa.");
      }

      case "add_note": {
        if (!ctx.dealId) return skipped(action.type, "Evento sem lead.");
        const saved = await addDealNote(
          admin,
          organizationId,
          ctx.dealId,
          renderTemplate(String(config.text), ctx.context),
          `${LABEL} "${ctx.ruleName}"`
        );
        return saved ? success(action.type) : failed(action.type, "Falha ao registrar a nota.");
      }

      case "set_temperature": {
        if (!ctx.dealId) return skipped(action.type, "Evento sem lead.");
        const { data } = await admin
          .from("deals")
          .update({ temperature: config.temperature })
          .eq("id", ctx.dealId)
          .eq("organization_id", organizationId)
          .select("id")
          .maybeSingle();
        return data ? success(action.type) : failed(action.type, "Lead não encontrado.");
      }

      case "set_handling_mode": {
        if (!ctx.conversationId) return skipped(action.type, "Lead sem conversa de WhatsApp.");
        const patch: Record<string, unknown> = { handling_mode: config.mode };
        if (config.mode === "human") {
          patch.handoff_reason = `${LABEL} "${ctx.ruleName}"`;
          patch.handoff_at = new Date().toISOString();
        }
        const { data } = await admin
          .from("whatsapp_conversations")
          .update(patch)
          .eq("id", ctx.conversationId)
          .eq("organization_id", organizationId)
          .select("id")
          .maybeSingle();
        return data ? success(action.type) : failed(action.type, "Conversa não encontrada.");
      }

      case "call_webhook":
        return callWebhook(ctx, String(config.url), config.secret as string | undefined);
    }
  } catch (err) {
    return failed(action.type, err instanceof Error ? err.message : String(err));
  }
  return failed(action.type, "Ação não implementada.");
}

/**
 * Bloqueia destino interno (SSRF): o servidor não pode ser usado para bater
 * em localhost, rede privada ou metadados de nuvem a mando de uma regra.
 */
export function isAllowedWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return false;
  }
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return false;
  return true;
}

async function callWebhook(ctx: ActionContext, url: string, secret?: string): Promise<ActionOutcome> {
  if (!isAllowedWebhookUrl(url)) return failed("call_webhook", "URL de destino não permitida.");
  const body = JSON.stringify({
    rule: ctx.ruleName,
    organization_id: ctx.organizationId,
    deal_id: ctx.dealId,
    conversation_id: ctx.conversationId,
    data: ctx.context,
    sent_at: new Date().toISOString(),
  });
  const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "CRM-JID-Midia/1.0" };
  if (secret) headers["X-JID-Signature"] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal, redirect: "manual" });
    return res.ok ? success("call_webhook") : failed("call_webhook", `Destino respondeu HTTP ${res.status}.`);
  } catch (err) {
    return failed("call_webhook", err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}
