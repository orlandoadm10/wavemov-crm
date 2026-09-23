// ============================================================
// Ferramentas sobre UM lead: ler contexto, atualizar cadastro, mover etapa,
// anotar, criar tarefa, salvar qualificação, buscar material, passar para
// humano. No turno da IA o lead vem do contexto; no MCP/API, do argumento
// (sempre conferido contra a organização do token).
// ============================================================
import { z } from "zod";
import { searchKnowledge } from "@/lib/features/ai-agent/application/knowledge-base";
import {
  addDealNote,
  createDealTask,
  findStage,
  handoffConversation,
  loadDeal,
  loadPipelineStages,
  moveDealToStage,
  type DealRow,
} from "../infrastructure/lead-commands";
import { defineTool, toolError, type CrmToolContext } from "./tool-types";

const ACTOR_LABEL: Record<CrmToolContext["actor"], string> = { ai: "IA", api: "API", mcp: "MCP" };

const dealIdProperty = {
  deal_id: {
    type: "string",
    description: "ID da negociação. Omitir no atendimento (o lead da conversa é usado).",
  },
};

async function resolveDeal(ctx: CrmToolContext, argDealId?: string): Promise<DealRow | null> {
  const dealId = ctx.dealId ?? argDealId;
  if (!dealId) return null;
  return loadDeal(ctx.admin, ctx.organizationId, dealId);
}

// No atendimento, "sem lead" é estado da conversa; na API/MCP, é id que não
// existe nesta empresa — e a resposta não distingue "de outra empresa" de
// "inexistente", para não virar oráculo de ids alheios.
const noLead = (ctx: CrmToolContext) =>
  ctx.actor === "ai"
    ? toolError("Nenhum lead vinculado a esta conversa.")
    : { ...toolError("Negociação não encontrada nesta empresa."), notFound: true };

export const getLeadContextTool = defineTool({
  name: "get_lead_context",
  description:
    "Lê o cadastro do contato, a negociação (etapa, valor, temperatura, qualificação), as etapas do funil e as tarefas abertas do lead.",
  parameters: { type: "object", properties: { ...dealIdProperty }, additionalProperties: false },
  schema: z.object({ deal_id: z.string().uuid().optional() }),
  actors: ["ai", "mcp", "api"],
  async execute(ctx, args) {
    const deal = await resolveDeal(ctx, args.deal_id);
    if (!deal) return noLead(ctx);
    const [stages, contactRes, tasksRes] = await Promise.all([
      loadPipelineStages(ctx.admin, ctx.organizationId, deal.pipeline_id),
      deal.contact_id
        ? ctx.admin
            .from("contacts")
            .select("id, name, email, phone, whatsapp_phone, document, city, state, notes")
            .eq("id", deal.contact_id)
            .eq("organization_id", ctx.organizationId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      ctx.admin
        .from("tasks")
        .select("title, due_at, priority")
        .eq("organization_id", ctx.organizationId)
        .eq("deal_id", deal.id)
        .eq("status", "pending")
        .limit(10),
    ]);
    const stage = stages.find((s) => s.id === deal.stage_id);
    return {
      ok: true,
      summary: `Contexto lido (${deal.title})`,
      data: {
        contact: contactRes.data,
        deal: {
          id: deal.id,
          title: deal.title,
          value: deal.value,
          status: deal.status,
          temperature: deal.temperature,
          source: deal.source,
          current_stage: stage?.name ?? null,
          qualification: deal.ai_qualification ?? {},
        },
        pipeline_stages: stages.map((s) => ({
          name: s.name,
          is_won: s.is_won_stage,
          is_lost: s.is_lost_stage,
        })),
        open_tasks: tasksRes.data ?? [],
      },
    };
  },
});

export const updateContactTool = defineTool({
  name: "update_contact",
  description:
    "Atualiza dados cadastrais do contato informados pelo próprio cliente (nome, e-mail, documento, cidade, UF, observações). Só envie campos confirmados.",
  parameters: {
    type: "object",
    properties: {
      ...dealIdProperty,
      name: { type: "string" },
      email: { type: "string" },
      document: { type: "string", description: "CPF ou CNPJ" },
      city: { type: "string" },
      state: { type: "string", description: "UF com 2 letras" },
      notes: { type: "string", description: "Observação a ACRESCENTAR ao cadastro" },
    },
    additionalProperties: false,
  },
  schema: z.object({
    deal_id: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(160).optional(),
    document: z.string().trim().max(20).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(2).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
  actors: ["ai", "mcp", "api"],
  async execute(ctx, args) {
    const deal = await resolveDeal(ctx, args.deal_id);
    const contactId = ctx.contactId ?? deal?.contact_id;
    if (!contactId) return toolError("Nenhum contato vinculado.");

    const { data: current } = await ctx.admin
      .from("contacts")
      .select("notes")
      .eq("id", contactId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!current) return toolError("Contato não encontrado.");

    const patch: Record<string, unknown> = {};
    for (const key of ["name", "email", "document", "city", "state"] as const) {
      if (args[key]) patch[key] = key === "state" ? args[key]!.toUpperCase() : args[key];
    }
    if (args.notes) {
      // Acrescenta, nunca substitui: a observação do vendedor não pode sumir.
      patch.notes = [current.notes, `[${ACTOR_LABEL[ctx.actor]}] ${args.notes}`].filter(Boolean).join("\n");
    }
    if (Object.keys(patch).length === 0) return toolError("Nenhum campo para atualizar.");

    const { data, error } = await ctx.admin
      .from("contacts")
      .update(patch)
      .eq("id", contactId)
      .eq("organization_id", ctx.organizationId)
      .select("id")
      .maybeSingle();
    if (error || !data) return toolError("Falha ao atualizar o contato.", error?.message);
    return { ok: true, summary: `Contato atualizado: ${Object.keys(patch).join(", ")}`, data: { updated: Object.keys(patch) } };
  },
});

export const updateDealTool = defineTool({
  name: "update_deal",
  description:
    "Atualiza a negociação: título, valor estimado (em reais), temperatura (cold, warm, hot) e previsão de fechamento (AAAA-MM-DD).",
  parameters: {
    type: "object",
    properties: {
      ...dealIdProperty,
      title: { type: "string" },
      value: { type: "number" },
      temperature: { type: "string", enum: ["cold", "warm", "hot"] },
      expected_close_date: { type: "string", description: "AAAA-MM-DD" },
    },
    additionalProperties: false,
  },
  schema: z.object({
    deal_id: z.string().uuid().optional(),
    title: z.string().trim().min(2).max(160).optional(),
    value: z.number().min(0).max(1_000_000_000).optional(),
    temperature: z.enum(["cold", "warm", "hot"]).optional(),
    expected_close_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  actors: ["ai", "mcp", "api"],
  async execute(ctx, args) {
    const deal = await resolveDeal(ctx, args.deal_id);
    if (!deal) return noLead(ctx);
    const { deal_id: _ignored, ...patch } = args;
    void _ignored;
    if (Object.keys(patch).length === 0) return toolError("Nenhum campo para atualizar.");
    const { data, error } = await ctx.admin
      .from("deals")
      .update(patch)
      .eq("id", deal.id)
      .eq("organization_id", ctx.organizationId)
      .select("id")
      .maybeSingle();
    if (error || !data) return toolError("Falha ao atualizar a negociação.", error?.message);
    await ctx.admin.from("activity_logs").insert({
      organization_id: ctx.organizationId,
      deal_id: deal.id,
      type: "ai_update",
      title: `${ACTOR_LABEL[ctx.actor]} atualizou a negociação`,
      description: Object.entries(patch).map(([k, v]) => `${k}: ${v}`).join("\n"),
      metadata: { source: ACTOR_LABEL[ctx.actor] },
    });
    return { ok: true, summary: `Negociação atualizada: ${Object.keys(patch).join(", ")}`, data: patch };
  },
});

export const moveDealStageTool = defineTool({
  name: "move_deal_stage",
  description:
    "Move o lead para outra etapa do funil dele, pelo nome da etapa (veja get_lead_context). Etapas de ganho/perda encerram a negociação.",
  parameters: {
    type: "object",
    properties: {
      ...dealIdProperty,
      stage_name: { type: "string", description: "Nome da etapa de destino" },
      stage_id: { type: "string", description: "Alternativa ao nome (MCP/API)" },
    },
    additionalProperties: false,
  },
  schema: z
    .object({
      deal_id: z.string().uuid().optional(),
      stage_name: z.string().trim().min(1).max(80).optional(),
      stage_id: z.string().uuid().optional(),
    })
    .refine((v) => v.stage_name || v.stage_id, "Informe stage_name ou stage_id."),
  actors: ["ai", "mcp", "api"],
  async execute(ctx, args) {
    const deal = await resolveDeal(ctx, args.deal_id);
    if (!deal) return noLead(ctx);
    const stages = await loadPipelineStages(ctx.admin, ctx.organizationId, deal.pipeline_id);
    const stage = findStage(stages, { stageId: args.stage_id, stageName: args.stage_name });
    if (!stage) {
      return toolError(
        `Etapa não encontrada. Etapas disponíveis: ${stages.map((s) => s.name).join(", ")}`
      );
    }
    const moved = await moveDealToStage(ctx.admin, deal, stage, { label: ACTOR_LABEL[ctx.actor] });
    if (!moved.ok) return toolError(moved.error);
    return {
      ok: true,
      summary: moved.changed ? `Movido para "${stage.name}"` : `Já estava em "${stage.name}"`,
      data: { stage: stage.name },
    };
  },
});

export const addNoteTool = defineTool({
  name: "add_note",
  description:
    "Registra uma nota no histórico do lead (resumo do atendimento, objeção, preferência). Visível para a equipe.",
  parameters: {
    type: "object",
    properties: { ...dealIdProperty, text: { type: "string" } },
    required: ["text"],
    additionalProperties: false,
  },
  schema: z.object({ deal_id: z.string().uuid().optional(), text: z.string().trim().min(3).max(4000) }),
  actors: ["ai", "mcp", "api"],
  async execute(ctx, args) {
    const deal = await resolveDeal(ctx, args.deal_id);
    if (!deal) return noLead(ctx);
    const saved = await addDealNote(ctx.admin, ctx.organizationId, deal.id, args.text, ACTOR_LABEL[ctx.actor]);
    return saved ? { ok: true, summary: "Nota registrada" } : toolError("Falha ao registrar a nota.");
  },
});

export const createTaskTool = defineTool({
  name: "create_task",
  description:
    "Cria uma tarefa para o responsável do lead (ex.: ligar, enviar proposta, confirmar reunião).",
  parameters: {
    type: "object",
    properties: {
      ...dealIdProperty,
      title: { type: "string" },
      description: { type: "string" },
      due_in_hours: { type: "number", description: "Prazo em horas a partir de agora" },
      priority: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: ["title"],
    additionalProperties: false,
  },
  schema: z.object({
    deal_id: z.string().uuid().optional(),
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(2000).optional(),
    due_in_hours: z.number().min(0).max(24 * 90).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
  }),
  actors: ["ai", "mcp", "api"],
  async execute(ctx, args) {
    const deal = await resolveDeal(ctx, args.deal_id);
    if (!deal) return noLead(ctx);
    const task = await createDealTask(ctx.admin, deal, {
      title: args.title,
      description: args.description,
      dueInHours: args.due_in_hours,
      priority: args.priority,
    });
    return task
      ? { ok: true, summary: `Tarefa criada: ${args.title}`, data: task }
      : toolError("Falha ao criar a tarefa.");
  },
});

export const saveQualificationTool = defineTool({
  name: "save_qualification",
  description:
    "Salva dados de qualificação extraídos da conversa (ex.: orçamento, prazo, necessidade). Use as chaves configuradas no agente. Marque qualified=true quando o lead estiver qualificado.",
  parameters: {
    type: "object",
    properties: {
      ...dealIdProperty,
      fields: { type: "object", description: "Pares chave → valor", additionalProperties: { type: "string" } },
      qualified: { type: "boolean" },
    },
    required: ["fields"],
    additionalProperties: false,
  },
  schema: z.object({
    deal_id: z.string().uuid().optional(),
    fields: z.record(z.string().max(60), z.union([z.string().max(500), z.number(), z.boolean()])),
    qualified: z.boolean().optional(),
  }),
  actors: ["ai", "mcp", "api"],
  async execute(ctx, args) {
    const deal = await resolveDeal(ctx, args.deal_id);
    if (!deal) return noLead(ctx);
    const merged = { ...(deal.ai_qualification ?? {}), ...args.fields };
    const patch: Record<string, unknown> = { ai_qualification: merged };
    if (args.qualified) patch.ai_status = "qualified";
    const { data, error } = await ctx.admin
      .from("deals")
      .update(patch)
      .eq("id", deal.id)
      .eq("organization_id", ctx.organizationId)
      .select("id")
      .maybeSingle();
    if (error || !data) return toolError("Falha ao salvar a qualificação.", error?.message);
    return {
      ok: true,
      summary: `Qualificação salva (${Object.keys(args.fields).join(", ")})${args.qualified ? " — qualificado" : ""}`,
      data: merged,
    };
  },
});

export const searchKnowledgeTool = defineTool({
  name: "search_knowledge",
  description:
    "Busca na base de conhecimento da empresa (preços, políticas, produtos, FAQ). Use antes de afirmar qualquer informação sobre a empresa.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "Pergunta ou termos de busca" } },
    required: ["query"],
    additionalProperties: false,
  },
  schema: z.object({ query: z.string().trim().min(2).max(500) }),
  actors: ["ai", "mcp", "api"],
  async execute(ctx, args) {
    try {
      const hits = await searchKnowledge(ctx.admin, {
        organizationId: ctx.organizationId,
        query: args.query,
        agentId: ctx.agentId ?? null,
      });
      return {
        ok: true,
        summary: `Base de conhecimento: ${hits.length} trecho(s) para "${args.query.slice(0, 60)}"`,
        data: hits.length > 0 ? hits : { result: "Nada encontrado na base de conhecimento." },
      };
    } catch (err) {
      return toolError("Base de conhecimento indisponível.", err instanceof Error ? err.message : String(err));
    }
  },
});

export const handoffToHumanTool = defineTool({
  name: "handoff_to_human",
  description:
    "Transfere a conversa para a equipe humana. Use quando o cliente pedir, quando não souber responder com segurança, em negociação de condições especiais ou reclamação.",
  parameters: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Motivo curto, visível para a equipe" },
      conversation_id: { type: "string", description: "Apenas MCP/API" },
    },
    required: ["reason"],
    additionalProperties: false,
  },
  schema: z.object({ reason: z.string().trim().min(3).max(300), conversation_id: z.string().uuid().optional() }),
  actors: ["ai", "mcp", "api"],
  async execute(ctx, args) {
    const conversationId = ctx.conversationId ?? args.conversation_id;
    if (!conversationId) return toolError("Nenhuma conversa para transferir.");
    const done = await handoffConversation(ctx.admin, ctx.organizationId, conversationId, args.reason);
    if (!done) return toolError("Conversa não encontrada.");
    return { ok: true, summary: `Transferido para humano: ${args.reason}`, handoff: { reason: args.reason } };
  },
});

export const LEAD_TOOLS = [
  getLeadContextTool,
  updateContactTool,
  updateDealTool,
  moveDealStageTool,
  addNoteTool,
  createTaskTool,
  saveQualificationTool,
  searchKnowledgeTool,
  handoffToHumanTool,
];
