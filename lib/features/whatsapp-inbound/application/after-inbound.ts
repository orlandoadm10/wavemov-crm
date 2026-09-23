// ============================================================
// O que acontece DEPOIS de uma mensagem entrar: turno do agente de IA (se a
// conversa está com a IA) e a fila de automações da empresa.
//
// Roda em `after()`: o webhook responde ao provedor na hora e o trabalho
// continua na mesma invocação. Um timeout aqui faria a UAZAPI/Meta reenviar a
// mensagem — por isso nada disto fica no caminho da resposta.
// ============================================================
import { after } from "next/server";
import { runAgentTurn } from "@/lib/features/ai-agent/application/run-agent-turn";
import { processCrmEvents } from "@/lib/features/automations/application/automation-engine";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IngestInboundResult } from "./ingest-inbound-message";

export function scheduleInboundFollowUp(organizationId: string, result: IngestInboundResult) {
  if (result.status === "error") return;
  after(async () => {
    const admin = createAdminClient();
    try {
      if (result.status === "ok" && !result.fromMe && result.handlingMode === "ai") {
        await runAgentTurn(admin, {
          organizationId,
          conversationId: result.conversationId,
          trigger: "inbound",
        });
      }
    } catch (err) {
      console.error("[after-inbound] turno da IA falhou", err instanceof Error ? err.message : err);
    }
    try {
      await processCrmEvents(admin, { organizationId, limit: 20 });
    } catch (err) {
      console.error("[after-inbound] automações falharam", err instanceof Error ? err.message : err);
    }
  });
}
