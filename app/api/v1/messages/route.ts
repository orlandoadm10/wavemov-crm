import { readJson, runApiTool } from "@/lib/features/integrations/application/api-v1";

// POST /api/v1/messages — envia WhatsApp numa conversa existente.
// Body: { "conversation_id"?: "…", "deal_id"?: "…", "text": "…" }
export async function POST(request: Request) {
  return runApiTool(request, "send_whatsapp_message", await readJson(request));
}
