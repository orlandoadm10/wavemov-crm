import { MonthlyBarChart, MonthlyLineChart } from "@/components/crm/dashboard-charts";
import { DashboardFilters } from "@/components/crm/dashboard-filters";
import { IngestionAlertBanner } from "@/components/crm/ingestion-alert-banner";
import { CampaignSales } from "@/components/dashboard/campaign-sales";
import { LossReasons, SellerRanking } from "@/components/dashboard/seller-and-loss";
import { StageFunnel } from "@/components/dashboard/stage-funnel";
import { TintPanel, TintStat } from "@/components/ui/tinted";
import { PageHeader } from "@/components/layout/page-header";
import {
  campaignStats,
  monthlySeries,
  sellerRanking,
  stageFunnel,
} from "@/lib/features/dashboard/domain/dashboard-metrics";
import { getIngestionHealth } from "@/lib/features/lead-ingestion/infrastructure/ingestion-health-query";
import { needsOnboarding } from "@/lib/features/onboarding/domain/steps";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, fullName } from "@/lib/utils";
import type { Deal, LostReason, Pipeline, PipelineStage, Profile, Task } from "@/types";
import { format, startOfMonth, subDays, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Award,
  CheckCircle2,
  Clock,
  Handshake,
  ListTodo,
  Megaphone,
  Percent,
  ThumbsDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
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
      supabase.from("pipelines").select("*, stages:pipeline_stages(*)").eq("organization_id", orgId).order("created_at"),
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
  // Perdas por motivo
  const lossByReason = new Map<string, number>();
  for (const d of lost) {
    const name = (d.lost_reason as LostReason | null)?.name ?? "Sem motivo";
    lossByReason.set(name, (lossByReason.get(name) ?? 0) + 1);
  }

  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;

  // Funil: etapas do funil filtrado, senão do padrão (nunca "o primeiro").
  const funnelPipeline =
    pipelines.find((p) => p.id === funil) ?? pipelines.find((p) => p.is_default) ?? null;
  const funnel = stageFunnel(
    deals.filter((d) => !funnelPipeline || d.pipeline_id === funnelPipeline.id),
    (funnelPipeline?.stages ?? []) as PipelineStage[]
  );
  const sellers = sellerRanking(deals);
  const people = new Map(
    members.map((m) => [m.id, { name: fullName(m) ?? "Responsável", avatarUrl: m.avatar_url, role: m.job_title }])
  );
  const campaigns = campaignStats(deals);
  const series = monthlySeries(allDeals, months);

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

  const pct = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader eyebrow="Análise" title="Dashboard" subtitle={`Como o funil está performando — ${PERIOD_LABEL[days] ?? `últimos ${days} dias`}.`} />

      <DashboardFilters pipelines={pipelines} members={members} />

      {ingestionHealth && (
        <IngestionAlertBanner
          healths={ingestionHealth.all}
          canFix={session.membership.role === "org_admin" || session.profile.is_global_admin}
        />
      )}

      {/* Indicadores (print 5), cada um na sua cor. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TintStat tint="sky" icon={<TrendingUp />} label="Negociações criadas" value={created} hint={`${open.length} ainda em aberto`} />
        <TintStat tint="emerald" icon={<Award />} label="Vendas realizadas" value={won.length} hint={formatCurrency(wonValue)} />
        <TintStat tint="rose" icon={<ThumbsDown />} label="Perdidas" value={lost.length} hint={`${pct(lossRate)} do que entrou no período`} />
        <TintStat tint="violet" icon={<Percent />} label="Taxa de conversão" value={pct(conversion)} hint={`${created} leads na base do período`} />

        <TintStat tint="sky" icon={<Wallet />} label="Valor em negociação" value={formatCurrency(openValue)} hint="Tudo que está em aberto" />
        <TintStat tint="emerald" icon={<Wallet />} label="Total vendido" value={formatCurrency(wonValue)} hint={`${won.length} venda(s) no período`} />
        <TintStat tint="amber" icon={<Wallet />} label="Ticket médio" value={formatCurrency(ticket)} hint="Valor médio por venda fechada" />
        <TintStat
          tint="orange"
          icon={<Clock />}
          label="Tempo médio até a venda"
          value={avgDaysToWin !== null ? `${avgDaysToWin} dias` : "—"}
          hint="Da criação ao ganho"
        />

        <TintStat tint="cyan" icon={<ListTodo />} label="Tarefas pendentes" value={pendingTasks} hint="Da empresa inteira" />
        <TintStat tint="emerald" icon={<CheckCircle2 />} label="Tarefas concluídas" value={doneTasks} hint="Da empresa inteira" />
        <TintStat tint="rose" icon={<ThumbsDown />} label="Taxa de perda geral" value={pct(lossRate)} hint="Sobre tudo que foi criado no período" />
        <TintStat tint="violet" icon={<Handshake />} label="Em andamento" value={open.length} hint="Negociações abertas do período" />
      </div>

      <TintPanel
        tint="sky"
        title={`Funil por etapa${funnelPipeline ? ` · ${funnelPipeline.name}` : ""}`}
        action={<span className="text-xs text-muted-foreground">largura = % da etapa com mais negociações abertas</span>}
      >
        <StageFunnel rows={funnel} />
      </TintPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <TintPanel tint="violet" title="Quem mais vendeu">
          <SellerRanking rows={sellers} people={people} />
        </TintPanel>
        <TintPanel tint="rose" title="Motivos de perda">
          <LossReasons
            rows={[...lossByReason.entries()]
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => b.value - a.value)}
          />
        </TintPanel>
      </div>

      <TintPanel tint="fuchsia" icon={<Megaphone />} title="De qual anúncio vêm as vendas">
        <CampaignSales rows={campaigns} />
      </TintPanel>

      <p className="pt-2 text-xs text-muted-foreground">
        Os gráficos abaixo mostram sempre os últimos 6 meses, independente do período filtrado.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <TintPanel tint="sky" title="Leads criados mês a mês">
          <MonthlyBarChart data={series} dataKey="leads" name="Leads" color="#1d5bf0" />
        </TintPanel>
        <TintPanel tint="violet" title="Conversão mês a mês (%)">
          <MonthlyLineChart data={series} dataKey="conversion" name="Conversão" color="#8b5cf6" />
        </TintPanel>
        <TintPanel tint="cyan" title="Número de vendas mês a mês">
          <MonthlyBarChart data={series} dataKey="sales" name="Vendas" color="#06b6d4" />
        </TintPanel>
        <TintPanel tint="emerald" title="Valor vendido mês a mês">
          <MonthlyBarChart data={series} dataKey="salesValue" name="Valor vendido" color="#10b981" currency />
        </TintPanel>
      </div>
    </div>
  );
}

const PERIOD_LABEL: Record<number, string> = {
  7: "últimos 7 dias",
  30: "últimos 30 dias",
  90: "últimos 90 dias",
  180: "últimos 6 meses",
  365: "último ano",
};
