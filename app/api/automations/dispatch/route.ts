import { processCrmEvents } from "@/lib/features/automations/application/automation-engine";
import { getSessionContext } from "@/lib/services/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const maxDuration = 30;

// ============================================================
// POST /api/automations/dispatch — drena a fila da empresa de quem está
// logado. O Kanban chama depois de mover um card: o evento foi gravado pela
// trigger no banco, e isto faz a automação ("entrou em Proposta → manda
// WhatsApp") acontecer na hora em vez de esperar o cron.
//
// Só processa eventos da organização da SESSÃO; nunca aceita organização do
// corpo. `viewer` não escreve em nada, então não dispara nada.
// ============================================================
export async function POST() {
  const session = await getSessionContext();
  if (session.membership.role === "viewer") {
    return NextResponse.json({ ok: true, events: 0 });
  }
  const admin = createAdminClient();
  const result = await processCrmEvents(admin, { organizationId: session.organization.id, limit: 20 });
  return NextResponse.json({ ok: true, ...result });
}
