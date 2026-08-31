import { DailyLeadsChart } from "@/components/crm/dashboard-charts";
import { HealthRow } from "@/components/crm/health-row";
import { PeriodFilter } from "@/components/crm/period-filter";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge, RoleBadge } from "@/components/ui/badge";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { daysSince, formatCurrency, formatDate, formatDateTime, fullName } from "@/lib/utils";
import { addZonedDays, dailySeries, resolvePeriod, startOfZonedDay } from "@/lib/utils/period";
import type { Deal, OrgDealStats, OrganizationMember } from "@/types";
import {
  Activity,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Mail,
  MonitorCheck,
  UserCircle,
  UserRound,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = { title: "Resumo da empresa" };
export const dynamic = "force-dynamic";

export default async function EmpresaPerfilPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const [{ id }, { periodo }] = await Promise.all([params, searchParams]);
  await getSessionContext();
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();

  const now = new Date();
  const period = resolvePeriod(periodo, now);
  // Mesmo fuso do `resolvePeriod` logo acima — ver a nota em /relatorios.
  const todayStart = startOfZonedDay(now).toISOString();
  const last7Start = addZonedDays(now, -6).toISOString();

  const countDeals = (from: string) =>
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", id)
      .gte("created_at", from);

  const [
    { data: membersRaw },
    { data: statsRaw },
    todayCount,
    last7Count,
    formsCount,
    activeFormsCount,
    { data: seriesRaw },
    { data: recentRaw },
  ] = await Promise.all([
    supabase
      .from("organization_members")
      .select("*, profile:profiles(*)")
      .eq("organization_id", id)
      .order("created_at"),
    // Uma linha agregada em vez de todas as negociações da empresa
    supabase
      .from("organization_deal_stats")
      .select("*")
      .eq("organization_id", id)
      .maybeSingle(),
    countDeals(todayStart),
    countDeals(last7Start),
    supabase
      .from("forms")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", id),
    supabase
      .from("forms")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", id)
      .eq("is_active", true),
    supabase
      .from("deals")
      .select("created_at")
      .eq("organization_id", id)
      .gte("created_at", period.from.toISOString())
      .lte("created_at", period.to.toISOString())
      .limit(5000),
    supabase
      .from("deals")
      .select(
        "id,title,created_at,value,status,contact:contacts(name)," +
          "stage:pipeline_stages(name),pipeline:pipelines(name)"
      )
      .eq("organization_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const members = (membersRaw ?? []) as OrganizationMember[];
  const owner = members.find((m) => m.role === "org_admin");
  const stats = (statsRaw ?? null) as OrgDealStats | null;
  const recent = (recentRaw ?? []) as unknown as Deal[];

  const total = Number(stats?.deals_total ?? 0);
  const open = Number(stats?.deals_open ?? 0);
  const won = Number(stats?.deals_won ?? 0);
  const lost = Number(stats?.deals_lost ?? 0);
  const soldValue = Number(stats?.value_won ?? 0);
  const openValue = Number(stats?.value_open ?? 0);
  const conversion = total > 0 ? (won / total) * 100 : 0;
  const daysWithoutLead = stats?.last_deal_at ? daysSince(stats.last_deal_at) : null;
  const inactivityDays = stats?.last_activity_at ? daysSince(stats.last_activity_at) : null;

  const series = dailySeries(
    ((seriesRaw ?? []) as { created_at: string }[]).map((d) => d.created_at),
    period.from,
    period.to
  );

  const lastLead = recent[0] ?? null;
  const formsTotal = formsCount.count ?? 0;
  const formsActive = activeFormsCount.count ?? 0;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Resumo da empresa"
        subtitle="Visão geral da conta, leads e atividade"
        actions={
          <>
            <PeriodFilter />
            <Link
              href="/empresas"
              className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-primary-700"
            >
              ← Empresas
            </Link>
          </>
        }
      />

      {/* Identificação */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={org.name} src={org.logo_url} size="xl" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-ink">{org.name}</h2>
              <BadgeCheck className="h-5 w-5 text-primary-500" />
              <Badge tone={org.is_active ? "green" : "slate"}>
                {org.is_active ? "Ativa" : "Inativa"}
              </Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
              {org.segment && <span>{org.segment}</span>}
              {org.owner_name && (
                <span className="flex items-center gap-1.5">
                  <UserCircle className="h-4 w-4 text-ink-faint" />
                  {org.owner_name}
                </span>
              )}
              {owner?.profile?.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-4 w-4 text-ink-faint" />
                  {owner.profile.email}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-primary-600">
              UniqueID: <span className="font-mono">{org.id}</span>
            </p>
          </div>
        </div>
      </Card>

      {/* Indicadores da conta */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total de leads" value={total} tone="blue" hint={`${open} em aberto`} />
        <StatCard label="Leads nos últimos 7 dias" value={last7Count.count ?? 0} tone="green" />
        <StatCard label="Leads hoje" value={todayCount.count ?? 0} tone="blue" />
        <StatCard
          label="Último lead"
          sublabel={stats?.last_deal_at ? formatDate(stats.last_deal_at) : "sem registros"}
          value={
            <span className="block truncate text-xl">
              {lastLead?.contact?.name ?? lastLead?.title ?? "—"}
            </span>
          }
          tone="amber"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Usuários da empresa" value={members.length} tone="slate" />
        <StatCard
          label="Negociações abertas"
          value={open}
          tone="blue"
          hint={`${formatCurrency(openValue)} em pipeline`}
        />
        <StatCard
          label="Ganhas / perdidas"
          value={
            <span className="text-2xl">
              <span className="text-emerald-600">{won}</span>
              <span className="text-ink-faint"> / </span>
              <span className="text-rose-600">{lost}</span>
            </span>
          }
          tone="green"
          hint={`${formatCurrency(soldValue)} vendidos`}
        />
        <StatCard
          label="Taxa de conversão"
          sublabel="ganhas sobre o total"
          value={`${conversion.toFixed(1)}%`}
          tone="green"
        />
      </div>

      {/* Saúde da conta + resumo rápido */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary-500" />
                Saúde da conta
              </span>
            }
          />
          <ul className="divide-y divide-line">
            <HealthRow
              icon={<Clock className="h-4 w-4" />}
              title="Última atividade"
              description="Última interação registrada no CRM"
              tone={inactivityDays === null ? "slate" : inactivityDays <= 1 ? "green" : inactivityDays <= 7 ? "amber" : "red"}
              value={
                inactivityDays === null
                  ? "—"
                  : inactivityDays === 0
                    ? "Hoje"
                    : `${inactivityDays} dia(s)`
              }
            />
            <HealthRow
              icon={<MonitorCheck className="h-4 w-4" />}
              title="CRM em uso"
              description="Empresa ativa e utilizando o sistema"
              tone={org.is_active && total > 0 ? "green" : "amber"}
              value={org.is_active && total > 0 ? "Sim" : "Não"}
            />
            <HealthRow
              icon={<FileText className="h-4 w-4" />}
              title="Formulários ativos"
              description="Formulários ativos em relação ao total"
              tone={formsTotal === 0 ? "slate" : formsActive === formsTotal ? "green" : "amber"}
              value={`${formsActive} de ${formsTotal}`}
            />
            <HealthRow
              icon={<CalendarDays className="h-4 w-4" />}
              title="Dias sem receber lead"
              description="Tempo desde a última entrada de lead"
              tone={
                daysWithoutLead === null
                  ? "slate"
                  : daysWithoutLead <= 2
                    ? "green"
                    : daysWithoutLead <= 7
                      ? "amber"
                      : "red"
              }
              value={daysWithoutLead === null ? "—" : `${daysWithoutLead} dia(s)`}
            />
          </ul>
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
            <QuickRow
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label="Empresa com leads ativos no funil"
              value={<Badge tone={open > 0 ? "green" : "slate"}>{open > 0 ? "Sim" : "Não"}</Badge>}
            />
            <QuickRow
              icon={<FileText className="h-4 w-4 text-ink-faint" />}
              label="Formulários cadastrados"
              value={formsTotal}
            />
            <QuickRow
              icon={<UserRound className="h-4 w-4 text-ink-faint" />}
              label="Responsável principal"
              value={fullName(owner?.profile) ?? "—"}
            />
            <QuickRow
              icon={<Zap className="h-4 w-4 text-ink-faint" />}
              label="Total em negociação"
              value={
                <span className="font-semibold text-emerald-600">
                  {formatCurrency(openValue)}
                </span>
              }
            />
            <QuickRow
              icon={<Clock className="h-4 w-4 text-ink-faint" />}
              label="Último lead recebido em"
              value={stats?.last_deal_at ? formatDateTime(stats.last_deal_at) : "—"}
            />
          </ul>
        </Card>
      </div>

      {/* Evolução + últimos leads */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Evolução de leads"
            subtitle={`Novos leads por dia · ${period.label.toLowerCase()}`}
          />
          <div className="p-4">
            <DailyLeadsChart data={series} height={220} />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Últimos leads"
            subtitle="Cinco entradas mais recentes"
            action={
              <Link
                href="/relatorios"
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                Ver todos
              </Link>
            }
          />
          <ul className="divide-y divide-line">
            {recent.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar name={d.contact?.name ?? d.title} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/negociacoes/${d.id}`}
                    className="truncate text-sm font-semibold text-ink hover:text-primary-700"
                  >
                    {d.contact?.name ?? d.title}
                  </Link>
                  <p className="truncate text-xs text-ink-faint">
                    {d.pipeline?.name ?? "—"} · {formatDateTime(d.created_at)}
                  </p>
                </div>
                {d.stage?.name && <Badge tone="green">{d.stage.name}</Badge>}
              </li>
            ))}
            {recent.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-ink-faint">
                Nenhum lead recebido nesta empresa.
              </li>
            )}
          </ul>
        </Card>
      </div>

      {/* Pessoas */}
      <Card className="mt-4">
        <CardHeader title="Pessoas" subtitle={`${members.length} pessoa(s) vinculada(s)`} />
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3.5">
              <Avatar name={fullName(m.profile)} src={m.profile?.avatar_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{fullName(m.profile)}</p>
                <p className="truncate text-xs text-ink-faint">
                  {m.profile?.job_title ?? m.profile?.email}
                </p>
              </div>
              <RoleBadge role={m.role} />
            </li>
          ))}
          {members.length === 0 && (
            <li className="px-5 py-6 text-sm text-ink-faint">Nenhuma pessoa vinculada.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}

function QuickRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{label}</span>
      <span className="max-w-[45%] truncate text-right text-sm font-semibold text-ink">
        {value}
      </span>
    </li>
  );
}
