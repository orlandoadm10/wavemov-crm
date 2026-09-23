// ============================================================
// Um turno do agente de IA numa conversa de WhatsApp.
//
//   mensagem do lead
//   → espera curta (agrupa mensagens picadas; o turno mais novo vence)
//   → gatilhos de handoff sobre a fala do lead (pedido de humano, jurídico,
//     etapa que exige humano)
//   → modelo + ferramentas do CRM (consultar, atualizar lead, mover etapa,
//     anotar, criar tarefa, qualificar, buscar na base, transferir)
//   → gatilho de incerteza sobre a resposta
//   → resposta pelo canal da conversa
//   → trilha em ai_runs
//
// Roda com service_role, sempre com a organização da conversa já autenticada
// por quem chamou (webhook). Nunca lança: falha vira linha em ai_runs.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendConversationMessage } from "@/lib/features/channels/application/send-conversation-message";
import { executeCrmTool, toChatTools, toolsFor } from "@/lib/features/crm-tools/application/registry";
import { handoffConversation } from "@/lib/features/crm-tools/infrastructure/lead-commands";
import type { AiAgent, AiRun } from "@/types";
import {
  DEFAULT_HANDOFF_MESSAGE,
  HANDOFF_REASON_LABEL,
  inboundHandoffReason,
  replyHandoffReason,
  type HandoffPolicy,
} from "../domain/handoff-rules";
import { buildSystemPrompt } from "../domain/system-prompt";
import {
  loadAgentForConversation,
  loadLeadSnapshot,
  loadRecentMessages,
  loadTurnConversation,
  organizationName,
  recordAiRun,
  type TurnMessage,
} from "../infrastructure/agent-queries";
import { createChatCompletion, isLlmConfigured, type ChatMessage } from "../infrastructure/llm-client";

const MAX_TOOL_ROUNDS = 6;

export interface RunAgentTurnInput {
  organizationId: string;
  conversationId: string;
  trigger: AiRun["trigger"];
  /** Espera antes de responder (agrupamento). Desligado em teste manual. */
  debounce?: boolean;
}

export type RunAgentTurnResult = Pick<AiRun, "status" | "output_text" | "error">;

type RunLog = Omit<AiRun, "id" | "created_at">;

export async function runAgentTurn(admin: SupabaseClient, input: RunAgentTurnInput): Promise<RunAgentTurnResult> {
  const { organizationId, conversationId } = input;
  const started = Date.now();

  const conversation = await loadTurnConversation(admin, organizationId, conversationId);
  if (!conversation || conversation.handling_mode !== "ai" || conversation.status === "archived") {
    return { status: "skipped", output_text: null, error: "Conversa fora do atendimento por IA." };
  }
  const agent = await loadAgentForConversation(admin, organizationId, conversation.ai_agent_id);

  const log: RunLog = {
    organization_id: organizationId,
    agent_id: agent?.id ?? null,
    conversation_id: conversationId,
    deal_id: conversation.deal_id,
    trigger: input.trigger,
    status: "skipped",
    input_text: null,
    output_text: null,
    tool_calls: [],
    model: agent?.model ?? null,
    prompt_tokens: 0,
    completion_tokens: 0,
    latency_ms: null,
    error: null,
  };
  const finish = async (patch: Partial<RunLog>): Promise<RunAgentTurnResult> => {
    Object.assign(log, patch, { latency_ms: Date.now() - started });
    await recordAiRun(admin, log);
    return { status: log.status, output_text: log.output_text, error: log.error };
  };

  if (!agent || !agent.is_active) return finish({ error: "Nenhum agente ativo para esta conversa." });

  // ---------- Agrupamento: só o turno da mensagem mais recente responde ----------
  const firstLook = await loadRecentMessages(admin, organizationId, conversationId, 1);
  const lastSeenId = firstLook[0]?.id;
  if (input.debounce !== false && agent.reply_delay_seconds > 0) {
    await new Promise((r) => setTimeout(r, agent.reply_delay_seconds * 1000));
  }
  const history = await loadRecentMessages(admin, organizationId, conversationId);
  const latest = history[history.length - 1];
  if (!latest || latest.direction !== "inbound") {
    return { status: "skipped", output_text: null, error: "Nada a responder." };
  }
  if (input.debounce !== false && latest.id !== lastSeenId) {
    // Chegou mensagem nova durante a espera: o turno dela responde tudo junto.
    return { status: "skipped", output_text: null, error: "Turno substituído por mensagem mais nova." };
  }

  const pendingText = unansweredInbound(history);
  log.input_text = pendingText.slice(0, 4000);

  const policy: HandoffPolicy = {
    handoffOnRequest: agent.handoff_on_request,
    handoffOnLegal: agent.handoff_on_legal,
    handoffOnUncertainty: agent.handoff_on_uncertainty,
  };
  const lead = await loadLeadSnapshot(admin, organizationId, conversation.deal_id);

  // ---------- Gatilhos antes do modelo ----------
  const beforeReason = lead?.stageRequiresHuman ? "etapa_humana" : inboundHandoffReason(pendingText, policy);
  if (beforeReason) {
    return performHandoff(admin, agent, log, finish, HANDOFF_REASON_LABEL[beforeReason], beforeReason !== "etapa_humana");
  }

  // Os gatilhos acima não dependem do modelo: pedido de humano transfere
  // mesmo com a IA sem chave. Daqui em diante, sem chave não há resposta.
  if (!isLlmConfigured()) return finish({ error: "IA sem chave configurada (AI_API_KEY)." });

  // ---------- Modelo + ferramentas ----------
  const enabled = agent.enabled_tools.filter((t) => t !== "search_knowledge" || agent.use_knowledge_base);
  const tools = toolsFor("ai", enabled);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        organizationName: await organizationName(admin, organizationId),
        agentName: agent.name,
        companyPrompt: agent.system_prompt,
        qualificationFields: agent.qualification_fields ?? [],
        useKnowledgeBase: agent.use_knowledge_base,
        enabledTools: enabled,
        lead: lead
          ? {
              contactName: lead.contactName,
              stageName: lead.stageName,
              dealTitle: lead.dealTitle,
              qualification: lead.qualification,
            }
          : null,
        now: new Date(),
      }),
    },
    ...historyToChat(history),
  ];

  const toolCtx = {
    admin,
    organizationId,
    actor: "ai" as const,
    conversationId,
    dealId: conversation.deal_id,
    contactId: conversation.contact_id,
    agentId: agent.id,
  };

  let reply: string | null = null;
  let handoffReason: string | null = null;
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await createChatCompletion({
        model: agent.model,
        temperature: Number(agent.temperature),
        messages,
        tools: toChatTools(tools),
      });
      log.prompt_tokens += completion.promptTokens;
      log.completion_tokens += completion.completionTokens;
      log.model = completion.model;

      if (completion.toolCalls.length === 0) {
        reply = completion.content?.trim() || null;
        break;
      }
      messages.push({ role: "assistant", content: completion.content, tool_calls: completion.toolCalls });
      for (const call of completion.toolCalls) {
        const args = safeJson(call.function.arguments);
        const result = await executeCrmTool(tools, toolCtx, call.function.name, args);
        log.tool_calls.push({ name: call.function.name, ok: result.ok, summary: result.summary });
        if (result.handoff) handoffReason = result.handoff.reason;
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result.ok ? (result.data ?? { ok: true }) : { error: result.error }).slice(0, 6000),
        });
      }
    }
  } catch (err) {
    return finish({ status: "error", error: err instanceof Error ? err.message : String(err) });
  }

  // ---------- Transferência decidida pelo próprio agente ----------
  if (handoffReason) {
    // A conversa já foi marcada pela ferramenta; falta avisar o lead.
    const notice = reply || agent.handoff_message || DEFAULT_HANDOFF_MESSAGE;
    const sent = await sendConversationMessage(admin, {
      organizationId,
      conversationId,
      text: notice,
      senderType: "ai",
    });
    return finish({
      status: "handoff",
      output_text: notice,
      error: sent.ok ? null : `Transferido, mas o aviso ao lead falhou: ${sent.error}`,
    });
  }

  if (!reply) return finish({ status: "error", error: "O modelo não produziu resposta." });

  const afterReason = replyHandoffReason(reply, policy);
  if (afterReason) {
    return performHandoff(admin, agent, log, finish, HANDOFF_REASON_LABEL[afterReason], true);
  }

  const sent = await sendConversationMessage(admin, {
    organizationId,
    conversationId,
    text: reply,
    senderType: "ai",
  });
  if (!sent.ok) return finish({ status: "error", output_text: reply, error: sent.error });

  if (lead && lead.aiStatus === "none") {
    await admin
      .from("deals")
      .update({ ai_status: "qualifying" })
      .eq("id", lead.dealId)
      .eq("organization_id", organizationId);
  }
  return finish({ status: "success", output_text: reply });
}

async function performHandoff(
  admin: SupabaseClient,
  agent: AiAgent,
  log: RunLog,
  finish: (patch: Partial<RunLog>) => Promise<RunAgentTurnResult>,
  reason: string,
  notifyLead: boolean
): Promise<RunAgentTurnResult> {
  const conversationId = log.conversation_id!;
  const notice = agent.handoff_message || DEFAULT_HANDOFF_MESSAGE;
  let error: string | null = null;
  if (notifyLead) {
    const sent = await sendConversationMessage(admin, {
      organizationId: log.organization_id,
      conversationId,
      text: notice,
      senderType: "ai",
    });
    if (!sent.ok) error = `Aviso ao lead falhou: ${sent.error}`;
  }
  await handoffConversation(admin, log.organization_id, conversationId, reason);
  log.tool_calls.push({ name: "handoff_to_human", ok: true, summary: reason });
  return finish({ status: "handoff", output_text: notifyLead ? notice : null, error });
}

/** Tudo que o lead escreveu desde a última resposta nossa. */
function unansweredInbound(history: TurnMessage[]): string {
  const pending: string[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.direction !== "inbound") break;
    pending.unshift(m.content ?? `[${m.message_type}]`);
  }
  return pending.join("\n");
}

function historyToChat(history: TurnMessage[]): ChatMessage[] {
  return history.map((m) => {
    const text = m.content ?? `[${m.message_type} sem texto]`;
    if (m.direction === "inbound") return { role: "user", content: text };
    // Mensagem da equipe entra como fala nossa, marcada, para o agente manter
    // o que o humano combinou em vez de contradizê-lo.
    const prefix = m.sender_type === "user" ? "(equipe) " : "";
    return { role: "assistant", content: `${prefix}${text}` };
  });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
