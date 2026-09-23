// ============================================================
// Ferramentas de consulta e criação para integrações (MCP e API v1):
// buscar contatos, listar funis e negociações, criar lead, enviar mensagem.
// Não ficam disponíveis para o agente de IA do atendimento — ele trabalha
// sobre o lead da conversa, não sobre a base inteira.
// ============================================================
import { z } from "zod";
import { sendConversationMessage } from "@/lib/features/channels/application/send-conversation-message";
import { resolveLeadResponsible } from "@/lib/features/lead-distribution/application/resolve-lead-responsible";
import { recordDistribution } from "@/lib/features/lead-distribution/infrastructure/distribution-queries";
import { normalizePhone } from "@/lib/utils";
import { defineTool, toolError } from "./tool-types";

/** Escapa curinga do PostgREST `ilike`/`or` para busca literal. */
function likeTerm(value: string) {
  return value.replace(/[%_,()*]/g, " ").trim();
}

export const searchContactsTool = defineTool({
  name: "search_contacts",
  description: "Busca contatos por nome, e-mail ou telefone.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number", description: "Máximo 50" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  schema: z.object({ query: z.string().trim().min(2).max(120), limit: z.number().int().min(1).max(50).optional() }),
  actors: ["mcp", "api"],
  async execute(ctx, args) {
    const term = likeTerm(args.query);
    const digits = args.query.replace(/\D/g, "");
    const filters = [`name.ilike.%${term}%`, `email.ilike.%${term}%`];
    if (digits.length >= 4) filters.push(`whatsapp_phone.ilike.%${digits}%`, `phone.ilike.%${digits}%`);
    const { data, error } = await ctx.admin
      .from("contacts")
      .select("id, name, email, phone, whatsapp_phone, city, state, created_at")
      .eq("organization_id", ctx.organizationId)
      .or(filters.join(","))
      .order("created_at", { ascending: false })
      .limit(args.limit ?? 20);
    if (error) return toolError("Falha na busca de contatos.", error.message);
    return { ok: true, summary: `${data.length} contato(s)`, data };
  },
});

export const listPipelinesTool = defineTool({
  name: "list_pipelines",
  description: "Lista os funis da empresa com suas etapas, na ordem.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  schema: z.object({}),
  actors: ["mcp", "api"],
  async execute(ctx) {
    const { data, error } = await ctx.admin
      .from("pipelines")
      .select("id, name, is_default, stages:pipeline_stages(id, name, order_index, is_won_stage, is_lost_stage)")
      .eq("organization_id", ctx.organizationId)
      .order("created_at");
    if (error) return toolError("Falha ao listar funis.", error.message);
    const pipelines = (data ?? []).map((p) => ({
      ...p,
      stages: [...((p.stages as { order_index: number }[] | null) ?? [])].sort((a, b) => a.order_index - b.order_index),
    }));
    return { ok: true, summary: `${pipelines.length} funil(is)`, data: pipelines };
  },
});

export const listDealsTool = defineTool({
  name: "list_deals",
  description: "Lista negociações, com filtros opcionais por etapa, funil, status e busca no título.",
  parameters: {
    type: "object",
    properties: {
      pipeline_id: { type: "string" },
      stage_id: { type: "string" },
      status: { type: "string", enum: ["open", "won", "lost", "archived"] },
      query: { type: "string" },
      limit: { type: "number", description: "Máximo 100" },
    },
    additionalProperties: false,
  },
  schema: z.object({
    pipeline_id: z.string().uuid().optional(),
    stage_id: z.string().uuid().optional(),
    status: z.enum(["open", "won", "lost", "archived"]).optional(),
    query: z.string().trim().max(120).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  actors: ["mcp", "api"],
  async execute(ctx, args) {
    let query = ctx.admin
      .from("deals")
      .select(
        "id, title, value, status, temperature, source, created_at, updated_at, pipeline_id, stage:pipeline_stages(id, name), contact:contacts(id, name, whatsapp_phone, email)"
      )
      .eq("organization_id", ctx.organizationId)
      .order("updated_at", { ascending: false })
      .limit(args.limit ?? 50);
    if (args.pipeline_id) query = query.eq("pipeline_id", args.pipeline_id);
    if (args.stage_id) query = query.eq("stage_id", args.stage_id);
    if (args.status) query = query.eq("status", args.status);
    if (args.query) query = query.ilike("title", `%${likeTerm(args.query)}%`);
    const { data, error } = await query;
    if (error) return toolError("Falha ao listar negociações.", error.message);
    return { ok: true, summary: `${data.length} negociação(ões)`, data };
  },
});

export const createLeadTool = defineTool({
  name: "create_lead",
  description:
    "Cria (ou reaproveita) o contato pelo WhatsApp/e-mail e abre uma negociação no funil padrão, com distribuição automática de responsável.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      phone: { type: "string", description: "WhatsApp com DDD" },
      email: { type: "string" },
      title: { type: "string" },
      value: { type: "number" },
      source: { type: "string", description: "Origem (ex.: Meta Ads, Typeform, n8n)" },
      notes: { type: "string" },
    },
    required: ["name"],
    additionalProperties: false,
  },
  schema: z
    .object({
      name: z.string().trim().min(2).max(120),
      phone: z.string().trim().max(30).optional(),
      email: z.string().trim().email().max(160).optional(),
      title: z.string().trim().max(160).optional(),
      value: z.number().min(0).optional(),
      source: z.string().trim().max(80).optional(),
      notes: z.string().trim().max(2000).optional(),
    })
    .refine((v) => v.phone || v.email, "Informe telefone ou e-mail."),
  actors: ["mcp", "api"],
  async execute(ctx, args) {
    const phone = args.phone ? normalizePhone(args.phone) : null;

    // Reaproveita o contato: a 0024 recusa WhatsApp duplicado na empresa.
    let contactId: string | null = null;
    if (phone) {
      const { data } = await ctx.admin
        .from("contacts")
        .select("id")
        .eq("organization_id", ctx.organizationId)
        .eq("whatsapp_phone", phone)
        .order("created_at")
        .limit(1);
      contactId = data?.[0]?.id ?? null;
    }
    if (!contactId && args.email) {
      const { data } = await ctx.admin
        .from("contacts")
        .select("id")
        .eq("organization_id", ctx.organizationId)
        .ilike("email", args.email)
        .order("created_at")
        .limit(1);
      contactId = data?.[0]?.id ?? null;
    }
    if (!contactId) {
      const { data, error } = await ctx.admin
        .from("contacts")
        .insert({
          organization_id: ctx.organizationId,
          name: args.name,
          email: args.email ?? null,
          whatsapp_phone: phone,
          phone: phone ? `+${phone}` : null,
          notes: args.notes ?? null,
        })
        .select("id")
        .single();
      if (error || !data) return toolError("Falha ao criar o contato.", error?.message);
      contactId = data.id;
    }

    const { data: pipeline } = await ctx.admin
      .from("pipelines")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("is_default", true)
      .maybeSingle();
    if (!pipeline) return toolError("A empresa não tem funil padrão.");
    const { data: stage } = await ctx.admin
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", pipeline.id)
      .eq("is_won_stage", false)
      .eq("is_lost_stage", false)
      .order("order_index")
      .limit(1)
      .maybeSingle();
    if (!stage) return toolError("O funil padrão não tem etapa aberta.");

    const distribution = await resolveLeadResponsible({
      admin: ctx.admin,
      organizationId: ctx.organizationId,
      lead: { origin: "external_ingest", formId: null },
    });
    const { data: deal, error: dealError } = await ctx.admin
      .from("deals")
      .insert({
        organization_id: ctx.organizationId,
        pipeline_id: pipeline.id,
        stage_id: stage.id,
        contact_id: contactId,
        responsible_id: distribution.responsibleId,
        title: args.title ?? args.name,
        value: args.value ?? 0,
        source: args.source ?? (ctx.actor === "mcp" ? "MCP" : "API"),
      })
      .select("id")
      .single();
    if (dealError || !deal) return toolError("Falha ao criar a negociação.", dealError?.message);
    await recordDistribution(ctx.admin, ctx.organizationId, deal.id, distribution.audit);

    return {
      ok: true,
      summary: `Lead criado: ${args.name}`,
      data: { deal_id: deal.id, contact_id: contactId, responsible_id: distribution.responsibleId },
    };
  },
});

export const sendWhatsappMessageTool = defineTool({
  name: "send_whatsapp_message",
  description:
    "Envia uma mensagem de WhatsApp numa conversa existente (por conversation_id, ou a conversa mais recente do deal_id).",
  parameters: {
    type: "object",
    properties: {
      conversation_id: { type: "string" },
      deal_id: { type: "string" },
      text: { type: "string" },
    },
    required: ["text"],
    additionalProperties: false,
  },
  schema: z
    .object({
      conversation_id: z.string().uuid().optional(),
      deal_id: z.string().uuid().optional(),
      text: z.string().trim().min(1).max(4000),
    })
    .refine((v) => v.conversation_id || v.deal_id, "Informe conversation_id ou deal_id."),
  actors: ["mcp", "api"],
  async execute(ctx, args) {
    let conversationId = args.conversation_id ?? null;
    if (!conversationId && args.deal_id) {
      const { data } = await ctx.admin
        .from("whatsapp_conversations")
        .select("id")
        .eq("organization_id", ctx.organizationId)
        .eq("deal_id", args.deal_id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1);
      conversationId = data?.[0]?.id ?? null;
    }
    if (!conversationId) return toolError("Nenhuma conversa encontrada para este lead.");
    const sent = await sendConversationMessage(ctx.admin, {
      organizationId: ctx.organizationId,
      conversationId,
      text: args.text,
      senderType: "automation",
    });
    if (!sent.ok) return toolError(sent.error);
    return { ok: true, summary: "Mensagem enviada", data: { message_id: sent.message.id } };
  },
});

export const DIRECTORY_TOOLS = [
  searchContactsTool,
  listPipelinesTool,
  listDealsTool,
  createLeadTool,
  sendWhatsappMessageTool,
];
