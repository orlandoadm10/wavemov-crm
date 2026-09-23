import { processCrmEvents, runNoReplyFollowUps } from "@/lib/features/automations/application/automation-engine";
import { isAuthorizedCron } from "@/lib/features/integrations/infrastructure/api-tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ============================================================
// /api/cron/automations — drena a fila de eventos de TODAS as empresas e
// roda a régua de follow-up (lead sem responder há N horas).
//
// Quem chama: Vercel Cron (manda `Authorization: Bearer $CRON_SECRET`
// sozinho) ou um fluxo do n8n a cada minuto com o mesmo cabeçalho. Sem
// `CRON_SECRET` configurado a rota recusa tudo.
//
// Os eventos de uma empresa também são drenados na hora, sem esperar o cron:
// depois de cada mensagem recebida (webhook) e de cada movimento no Kanban
// (/api/automations/dispatch). O cron é a rede de segurança e o relógio do
// follow-up e das automações com atraso.
// ============================================================
async function handle(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const admin = createAdminClient();
  const deadline = Date.now() + 45_000;

  let events = 0;
  let runs = 0;
  // Drena em lotes até esvaziar ou chegar perto do limite de tempo.
  while (Date.now() < deadline) {
    const batch = await processCrmEvents(admin, { limit: 50 });
    events += batch.events;
    runs += batch.runs;
    if (batch.events < 50) break;
  }
  const followUps = await runNoReplyFollowUps(admin);

  return NextResponse.json({ ok: true, events, runs, followUps });
}

export const GET = handle;
export const POST = handle;
