import { NextResponse } from "next/server";
import { readJson, runApiTool } from "@/lib/features/integrations/application/api-v1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/v1/deals/:id — contato, negociação, etapas do funil e tarefas abertas.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id inválido." }, { status: 400 });
  return runApiTool(request, "get_lead_context", { deal_id: id });
}

// PATCH /api/v1/deals/:id
//   { "stage_id": "…" } ou { "stage_name": "Proposta" } → move de etapa
//   { "title"?, "value"?, "temperature"?, "expected_close_date"? } → atualiza
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id inválido." }, { status: 400 });
  const body = (await readJson(request)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo JSON obrigatório." }, { status: 400 });
  }
  const { stage_id, stage_name, ...fields } = body;
  if (stage_id || stage_name) {
    const moved = await runApiTool(request, "move_deal_stage", {
      deal_id: id,
      ...(stage_id ? { stage_id } : {}),
      ...(stage_name ? { stage_name } : {}),
    });
    if (!moved.ok || Object.keys(fields).length === 0) return moved;
  }
  return runApiTool(request, "update_deal", { deal_id: id, ...fields });
}
