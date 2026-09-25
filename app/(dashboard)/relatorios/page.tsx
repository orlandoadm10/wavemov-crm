import { DailyLeadsChart } from "@/components/crm/dashboard-charts";
import { LeadsReportTable } from "@/components/crm/leads-report-table";
import { PeriodFilter } from "@/components/crm/period-filter";
import { ReportNav } from "@/components/crm/report-nav";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, fullName } from "@/lib/utils";
import { addZonedDays, dailySeries, endOfZonedDay, resolvePeriod, startOfZonedDay } from "@/lib/utils/period";
import type { Deal, Form, LeadRow } from "@/types";
import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  TrendingUp,
  Trophy,
  Tags,
  UserRound,
  Zap,
  Layers,
} from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Entrada de leads" };
export const dynamic = "force-dynamic";

type Search = Promise<{ periodo?: string }>;

export default async function RelatoriosPage({ searchParams }: { searchParams: Search }) {
  const { periodo } = await searchParams;
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const now = new Date();
  const period = resolvePeriod(periodo, now);
  const fromISO = period.from.toISOString();
  const toISO = period.to.toISOString();

  // Mesmo fuso do `resolvePeriod` logo acima: com as bordas no fuso do
  // processo (UTC na Vercel), "Hoje" e "Total no período" contariam recortes
  // diferentes e se contradiriam lado a lado na mesma tela.
  const todayStart = startOfZonedDay(now).toISOString();
  const yesterdayStart = addZonedDays(now, -1).toISOString();
  const yesterdayEnd = endOfZonedDay(addZonedDays(now, -1)).toISOString();
  const last7Start = addZonedDays(now, -6).toISOString();
  const last30Start = addZonedDays(now, -29).toISOString();

  // Contagens: `head: true` não transfere linhas, só o total.
  const countDeals = (from: string, to?: string) => {
    let q = supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    return q;
  };

  const [
    todayCount,
    yesterdayCount,
    last7Count,
    last30Count,
    periodCount,
    { data: seriesRaw },
    { data: rowsRaw },
    { data: formsRaw },
  ] = await Promise.all([
    countDeals(todayStart),
    countDeals(yesterdayStart, yesterdayEnd),
    countDeals(last7Start),
    countDeals(last30Start),
    countDeals(fromISO, toISO),
    // Só a data — payload mínimo para montar o gráfico diário
    supabase
      .from("deals")
      .select("created_at")
      .eq("organization_id", orgId)
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .order("created_at", { ascending: false })
      .limit(5000),
    // Tabela: página curta com os campos exibidos
    supabase
      .from("deals")
      .select(
        "id,title,created_at,source," +
          "contact:contacts(name,whatsapp_phone)," +
          "stage:pipeline_stages(name,color)," +
          "pipeline:pipelines(name)," +
          "responsible:profiles!deals_responsible_id_fkey(first_name,last_name)"
      )
      .eq("organization_id", orgId)
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("forms")
      .select("id,name,is_active")
      .eq("organization_id", orgId)
      .order("name"),
  ]);

  const forms = (formsRaw ?? []) as Pick<Form, "id" | "name" | "is_active">[];
  const activeForms = forms.filter((f) => f.is_active).length;
  const deals = (rowsRaw ?? []) as unknown as Deal[];

  // Qual formulário originou cada negociação (join pela tabela de submissões)
  const dealIds = deals.map((d) => d.id);
  const { data: submissionsRaw } = dealIds.length
    ? await supabase
        .from("form_submissions")
        .select("deal_id,form_id")
        .in("deal_id", dealIds)
    : { data: [] };

  const formNameById = new Map(forms.map((f) => [f.id, f.name]));
  const formByDeal = new Map<string, string>();
  for (const s of (submissionsRaw ?? []) as { deal_id: string | null; form_id: string }[]) {
    if (s.deal_id) formByDeal.set(s.deal_id, formNameById.get(s.form_id) ?? "Formulário removido");
  }

  const rows: LeadRow[] = deals.map((d) => ({
    id: d.id,
    title: d.title,
    created_at: d.created_at,
    source: d.source,
    contactName: d.contact?.name ?? null,
    whatsapp: d.contact?.whatsapp_phone ?? null,
    formName: formByDeal.get(d.id) ?? null,
    pipelineName: d.pipeline?.name ?? null,
    stageName: d.stage?.name ?? null,
    stageColor: d.stage?.color ?? null,
    responsibleName: fullName(d.responsible),
  }));

  // Ranking de formulários no período
  const topForms = (() => {
    const counter = new Map<string, number>();
    for (const r of rows) {
      if (!r.formName) continue;
      counter.set(r.formName, (counter.get(r.formName) ?? 0) + 1);
    }
    const list = [...counter.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    const max = Math.max(1, ...list.map((l) => l.total));
    return list.map((l) => ({ ...l, share: (l.total / max) * 100 }));
  })();

  const series = dailySeries(
    ((seriesRaw ?? []) as { created_at: string }[]).map((d) => d.created_at),
    period.from,
    period.to
  );

  const total = periodCount.count ?? 0;
  const perDay = period.days > 0 ? total / period.days : 0;
  const lastLead = rows[0] ?? null;
  const minutesSinceLast = lastLead
    ? Math.max(0, Math.round((now.getTime() - new Date(lastLead.created_at).getTime()) / 60000))
    : null;

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="Análise"
        title="Relatório de entrada de leads"
        subtitle="Acompanhe a entrada de leads por período e formulário"
        actions={<PeriodFilter />}
      />
      <ReportNav />

      {/* Indicadores fixos — independentes do período selecionado */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Leads hoje"
          value={todayCount.count ?? 0}
          tone="blue"
          icon={<CalendarDays className="h-5 w-5 text-primary-500" />}
        />
        <StatCard
          label="Leads ontem"
          value={yesterdayCount.count ?? 0}
          tone="green"
          icon={<CalendarDays className="h-5 w-5 text-emerald-500" />}
        />
        <StatCard
          label="Últimos 7 dias"
          value={last7Count.count ?? 0}
          tone="blue"
          icon={<CalendarClock className="h-5 w-5 text-primary-500" />}
        />
        <StatCard
          label="Últimos 30 dias"
          value={last30Count.count ?? 0}
          tone="slate"
          icon={<CalendarClock className="h-5 w-5 text-slate-400" />}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Último lead"
          sublabel={lastLead ? formatDateTime(lastLead.created_at) : "sem registros"}
          value={
            <span className="block truncate text-xl">
              {lastLead?.contactName ?? lastLead?.title ?? "—"}
            </span>
          }
          tone="amber"
          icon={<UserRound className="h-5 w-5 text-amber-500" />}
        />
        <StatCard
          label="Tempo desde o último"
          value={
            <span className="text-2xl">
              {minutesSinceLast === null
                ? "—"
                : minutesSinceLast < 60
                  ? `${minutesSinceLast} min`
                  : `${Math.floor(minutesSinceLast / 60)} h`}
            </span>
          }
          tone="slate"
          icon={<Clock className="h-5 w-5 text-slate-400" />}
        />
        <StatCard
          label="Formulários ativos"
          sublabel={`de ${forms.length} cadastrado(s)`}
          value={activeForms}
          tone="blue"
          icon={<FileText className="h-5 w-5 text-primary-500" />}
        />
        <StatCard
          label="Média por dia"
          sublabel={`no período de ${period.label.toLowerCase()}`}
          value={perDay.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
          tone="green"
          icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
        />
      </div>

      {/* Gráfico + resumo */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary-500" />
                Entrada de leads
              </span>
            }
            subtitle={`${total} lead(s) em ${period.label.toLowerCase()}`}
          />
          <div className="p-4">
            <DailyLeadsChart data={series} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary-500" />
                Resumo rápido
              </span>
            }
          />
          <ul className="divide-y divide-line">
            <SummaryRow
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label="Empresa recebendo leads"
              value={<Badge tone={total > 0 ? "green" : "slate"}>{total > 0 ? "Sim" : "Não"}</Badge>}
            />
            <SummaryRow
              icon={<FileText className="h-4 w-4 text-ink-faint" />}
              label="Último formulário"
              value={lastLead?.formName ?? "—"}
            />
            <SummaryRow
              icon={<Filter className="h-4 w-4 text-ink-faint" />}
              label="Funil principal"
              value={lastLead?.pipelineName ?? "—"}
            />
            <SummaryRow
              icon={<Filter className="h-4 w-4 text-ink-faint" />}
              label="Etapa de entrada"
              value={
                lastLead?.stageName ? <Badge tone="green">{lastLead.stageName}</Badge> : "—"
              }
            />
            <SummaryRow
              icon={<UserRound className="h-4 w-4 text-ink-faint" />}
              label="Responsável do último"
              value={lastLead?.responsibleName ?? "—"}
            />
          </ul>
        </Card>
      </div>

      {/* Tabela + ranking */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LeadsReportTable
            rows={rows}
            formNames={[...new Set(rows.map((r) => r.formName).filter(Boolean) as string[])]}
            truncated={rows.length >= 100}
          />
        </div>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Top formulários
              </span>
            }
            subtitle="Leads gerados no período"
          />
          <div className="space-y-3.5 p-5">
            {topForms.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-faint">
                Nenhum lead veio de formulário no período.
              </p>
            )}
            {topForms.map((f, i) => (
              <div key={f.name}>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[10px] font-bold text-primary-700">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.name}</span>
                  <span className="text-sm font-bold text-ink">{f.total}</span>
                  <span className="text-xs text-ink-faint">leads</span>
                </div>
                <div className="mt-1.5 ml-7.5 h-1.5 rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-primary-600"
                    style={{ width: `${f.share}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{label}</span>
      <span className="max-w-[45%] truncate text-right text-sm font-semibold text-ink">
        {value}
      </span>
    </li>
  );
}
