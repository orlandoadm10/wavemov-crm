import {
  DealsByStageChart,
  HorizontalCountChart,
  LeadsPerMonthChart,
  SalesPerMonthChart,
} from "@/components/crm/dashboard-charts";
import { DashboardFilters } from "@/components/crm/dashboard-filters";
import { IngestionAlertBanner } from "@/components/crm/ingestion-alert-banner";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { getIngestionHealth } from "@/lib/features/lead-ingestion/infrastructure/ingestion-health-query";
import { needsOnboarding } from "@/lib/features/onboarding/domain/steps";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, fullName } from "@/lib/utils";
import type { Deal, LostReason, Pipeline, PipelineStage, Profile, Task } from "@/types";
import { format, startOfMonth, subDays, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { redirect } from "next/navigation";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

type Search = Promise<{ periodo?: string; funil?: string; responsavel?: string }>;

export default async function DashboardPage({ searchParams }: { searchParams: Search }) {
  const { periodo, funil, responsavel } = await searchParams;
  const session = await getSessionContext();

  // O assistente de configuração inicial é oferecido AQUI, e não no layout:
  // `/dashboard` é onde o login e a raiz desembocam. No layout, os atalhos do
  // próprio assistente (WhatsApp, IA) voltariam para ele em círculo.
  if (
    needsOnboarding({
      onboardedAt: session.organization.onboarded_at,
      isOrgAdminMember:
        session.membership.role === "org_admin" && session.membership.id !== "global-admin",
    })
  ) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const orgId = session.organization.id;

  const days = Number(periodo ?? "90") || 90;
  const since = subDays(new Date(), days).toISOString();
  const monthsStart = startOfMonth(subMonths(new Date(), 5)).toISOString();

  let dealsQuery = supabase
    .from("deals")
    .select("*, responsible:profiles!deals_responsible_id_fkey(*), stage:pipeline_stages(*), lost_reason:lost_reasons(*)")
    .eq("organization_id", orgId)
    .gte("created_at", since < monthsStart ? since : monthsStart);
  if (funil) dealsQuery = dealsQuery.eq("pipeline_id", funil);
  if (responsavel) dealsQuery = dealsQuery.eq("responsible_id", responsavel);

  const [{ data: dealsRaw }, { data: tasksRaw }, { data: pipelinesRaw }, { data: membersRaw }] =
    await Promise.all([
      dealsQuery,
      supabase.from("tasks").select("id,status,due_at").eq("organization_id", orgId),
      supabase.from("pipelines").select("*").eq("organization_id", orgId).order("created_at"),
      supabase
        .from("organization_members")
        .select("profile:profiles(*)")
        .eq("organization_id", orgId)
        .eq("is_active", true),
    ]);

  const allDeals = (dealsRaw ?? []) as unknown as Deal[];
  const tasks = (tasksRaw ?? []) as Pick<Task, "id" | "status" | "due_at">[];
  const pipelines = (pipelinesRaw ?? []) as Pipeline[];
  const members = ((membersRaw ?? []) as unknown as { profile: Profile }[]).map((m) => m.profile);

  // Deals dentro do período selecionado
  const sinceDate = new Date(since);
  const deals = allDeals.filter((d) => new Date(d.created_at) >= sinceDate);

  const created = deals.length;
  const won = deals.filter((d) => d.status === "won");
  const lost = deals.filter((d) => d.status === "lost");
  const open = deals.filter((d) => d.status === "open");

  const wonValue = won.reduce((s, d) => s + Number(d.value), 0);
  const openValue = open.reduce((s, d) => s + Number(d.value), 0);
  const ticket = won.length > 0 ? wonValue / won.length : 0;
  const conversion = created > 0 ? (won.length / created) * 100 : 0;
  const lossRate = created > 0 ? (lost.length / created) * 100 : 0;

  const avgDaysToWin =
    won.length > 0
      ? Math.round(
          won.reduce((s, d) => {
            const start = new Date(d.created_at).getTime();
            const end = d.won_at ? new Date(d.won_at).getTime() : start;
            return s + (end - start) / (1000 * 60 * 60 * 24);
          }, 0) / won.length
        )
      : null;

  // Séries mensais (últimos 6 meses, independente do filtro de período)
  const months = Array.from({ length: 6 }).map((_, i) => {
    const date = subMonths(new Date(), 5 - i);
    const key = format(date, "yyyy-MM");
    return { key, label: format(date, "MMM", { locale: ptBR }) };
  });
  const leadsPerMonth = months.map((m) => ({
    month: m.label,
    leads: allDeals.filter((d) => format(new Date(d.created_at), "yyyy-MM") === m.key).length,
  }));
  const salesPerMonth = months.map((m) => ({
    month: m.label,
    valor: allDeals
      .filter((d) => d.status === "won" && d.won_at && format(new Date(d.won_at), "yyyy-MM") === m.key)
      .reduce((s, d) => s + Number(d.value), 0),
  }));

  // Negociações por etapa (somente abertas)
  const stageMap = new Map<string, { name: string; value: number; color: string }>();
  for (const d of open) {
    const stage = d.stage as PipelineStage | null;
    if (!stage) continue;
    const cur = stageMap.get(stage.id) ?? { name: stage.name, value: 0, color: stage.color };
    cur.value += 1;
    stageMap.set(stage.id, cur);
  }

  // Ganhos por responsável
  const winsByResp = new Map<string, number>();
  for (const d of won) {
    const name = fullName(d.responsible) ?? "Sem responsável";
    winsByResp.set(name, (winsByResp.get(name) ?? 0) + Number(d.value));
  }

  // Perdas por motivo
  const lossByReason = new Map<string, number>();
  for (const d of lost) {
    const name = (d.lost_reason as LostReason | null)?.name ?? "Sem motivo";
    lossByReason.set(name, (lossByReason.get(name) ?? 0) + 1);
  }

  // UTMs
  const utmCount = (list: Deal[]) => {
    const map = new Map<string, number>();
    for (const d of list) {
      const key = d.utm_source || d.source || "Direto";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  };

  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;

  // Saúde da entrada de leads — só para quem enxerga a organização inteira.
  // `seller`/`agent` ficam de fora: sob a 0011 eles leem apenas os próprios
  // leads e conversas, então o indicador diria "sem entrada há N dias" para um
  // vendedor num dia quieto, com a empresa recebendo normalmente.
  const canSeeIngestionHealth =
    session.membership.role === "org_admin" ||
    session.membership.role === "viewer" ||
    session.profile.is_global_admin;
  const ingestionHealth = canSeeIngestionHealth
    ? await getIngestionHealth(supabase, orgId)
    : null;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral do funil, performance e atividades"
        actions={<DashboardFilters pipelines={pipelines} members={members} />}
      />

      {ingestionHealth && (
        <IngestionAlertBanner
          healths={ingestionHealth.all}
          canFix={session.membership.role === "org_admin" || session.profile.is_global_admin}
        />
      )}

      {/* Linha 1 — contadores */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Negociações criadas"
          sublabel="no período"
          value={created}
          tone="blue"
          hint={`${open.length} em andamento`}
        />
        <StatCard
          label="Negociações vendidas"
          sublabel="ganhas"
          value={won.length}
          tone="green"
          hint={`${conversion.toFixed(1)}% taxa de conversão`}
        />
        <StatCard
          label="Negociações perdidas"
          sublabel="no período"
          value={lost.length}
          tone="red"
          hint={`${lossRate.toFixed(1)}% taxa de perda`}
        />
        <StatCard
          label="Tempo médio até a venda"
          sublabel="em dias"
          value={avgDaysToWin !== null ? `${avgDaysToWin}d` : "—"}
          tone="amber"
          hint="baseado em negociações ganhas"
        />
      </div>

      {/* Linha 2 — valores */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Valor total em negociação"
          sublabel="pipeline aberto"
          value={<span className="text-2xl">{formatCurrency(openValue)}</span>}
          tone="blue"
        />
        <StatCard
          label="Valor total vendido"
          sublabel="negociações ganhas"
          value={<span className="text-2xl">{formatCurrency(wonValue)}</span>}
          tone="green"
        />
        <StatCard
          label="Ticket médio"
          sublabel="por venda no período"
          value={<span className="text-2xl">{formatCurrency(ticket)}</span>}
          tone="slate"
        />
        <StatCard
          label="Tarefas"
          sublabel="pendentes / concluídas"
          value={
            <span className="text-2xl">
              {pendingTasks} <span className="text-ink-faint">/</span>{" "}
              <span className="text-emerald-600">{doneTasks}</span>
            </span>
          }
          tone="amber"
        />
      </div>

      {/* Gráficos principais */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Leads por mês" subtitle="Todos os leads criados mês a mês" />
          <div className="p-4">
            <LeadsPerMonthChart data={leadsPerMonth} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Valor em vendas" subtitle="Receita de negociações ganhas por mês" />
          <div className="p-4">
            <SalesPerMonthChart data={salesPerMonth} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Negociações por etapa" subtitle="Distribuição do pipeline aberto" />
          <div className="p-4">
            <DealsByStageChart data={[...stageMap.values()]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Quem mais vendeu" subtitle="Valor ganho por responsável" />
          <div className="p-4">
            <HorizontalCountChart
              data={[...winsByResp.entries()]
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value)}
              color="#10b981"
              currency
            />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Motivos de perda" />
          <div className="p-4">
            <HorizontalCountChart
              data={[...lossByReason.entries()]
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value)}
              color="#ef4444"
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="UTMs / origens (criadas)" />
          <div className="p-4">
            <HorizontalCountChart data={utmCount(deals)} />
          </div>
        </Card>
        <Card>
          <CardHeader title="UTMs / origens (vendas)" />
          <div className="p-4">
            <HorizontalCountChart data={utmCount(won)} color="#10b981" />
          </div>
        </Card>
      </div>
    </div>
  );
}
