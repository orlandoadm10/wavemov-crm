"use server";

import { runAgentTurn } from "@/lib/features/ai-agent/application/run-agent-turn";
import { getSessionContext } from "@/lib/services/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type HandlingModeResult = { error?: string; success?: string };

const inputSchema = z.object({
  conversationId: z.string().uuid(),
  mode: z.enum(["ai", "human"]),
});

/**
 * Passa a conversa para a IA ou devolve à equipe.
 *
 * A escrita usa o cliente da SESSÃO: a policy da 0011 já restringe
 * seller/agent às próprias conversas, e o `.select()` confirma a linha —
 * update recusado pela RLS volta sem erro e não pode virar "sucesso".
 */
export async function setConversationHandlingModeAction(input: unknown): Promise<HandlingModeResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const session = await getSessionContext();
  if (session.membership.role === "viewer") {
    return { error: "Seu perfil é somente leitura." };
  }
  const organizationId = session.organization.id;
  const supabase = await createClient();

  const patch: Record<string, unknown> = { handling_mode: parsed.data.mode };
  if (parsed.data.mode === "ai") {
    const { data: agent } = await supabase
      .from("ai_agents")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_default", true)
      .eq("is_active", true)
      .maybeSingle();
    if (!agent) {
      return { error: "Nenhum agente de IA ativo. Configure e ative um agente padrão em IA." };
    }
    patch.ai_agent_id = agent.id;
    patch.handoff_reason = null;
    patch.handoff_at = null;
  } else {
    patch.handoff_reason = "Atendente assumiu a conversa";
    patch.handoff_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .update(patch)
    .eq("id", parsed.data.conversationId)
    .eq("organization_id", organizationId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Não foi possível alterar o atendimento desta conversa." };

  // Devolvida à IA com o lead esperando resposta: o agente responde agora.
  if (parsed.data.mode === "ai") {
    after(async () => {
      await runAgentTurn(createAdminClient(), {
        organizationId,
        conversationId: parsed.data.conversationId,
        trigger: "manual",
        debounce: false,
      }).catch((err) => console.error("[atendimento] turno manual da IA falhou", err));
    });
  }

  revalidatePath("/atendimento");
  return { success: parsed.data.mode === "ai" ? "A IA assumiu a conversa." : "Você assumiu a conversa." };
}
