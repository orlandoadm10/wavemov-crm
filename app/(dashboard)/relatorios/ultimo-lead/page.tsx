import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge, DealStatusBadge, TemperatureBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDateTime, fullName } from "@/lib/utils";
import type { ActivityLog, Deal, Form, FormSubmission } from "@/types";
import {
  ArrowRight,
  CalendarClock,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  Globe,
  Mail,
  MessageCircle,
  Star,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { startOfDay } from "date-fns";

export const metadata = { title: "Último lead recebido" };
export const dynamic = "force-dynamic";

export default async function UltimoLeadPage() {
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;
  const now = new Date();

  const [{ data: latestRaw }, todayCount, { data: recentRaw }] = await Promise.all([
    supabase
      .from("deals")
      .select(
        "*, contact:contacts(*), stage:pipeline_stages(*), pipeline:pipelines(*)," +
          "responsible:profiles!deals_responsible_id_fkey(*)"
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", startOfDay(now).toISOString()),
    supabase
      .from("deals")
      .select(
        "id,title,created_at,value,status,source," +
          "contact:contacts(name)," +
          "stage:pipeline_stages(name)," +
          "pipeline:pipelines(name)," +
          "responsible:profiles!deals_responsible_id_fkey(first_name,last_name)"
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const lead = latestRaw as unknown as Deal | null;

  if (!lead) {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Último lead recebido" subtitle="Dados do lead mais recente da empresa" />
        <EmptyState
          icon={<UserRound className="h-6 w-6" />}
          title="Nenhum lead recebido ainda"
          description="Assim que um formulário for enviado ou uma conversa de WhatsApp chegar, o lead aparece aqui."
          action={
            <Link href="/formularios" className={buttonClasses()}>
              Criar formulário de captura
            </Link>
          }
        />
      </div>
    );
  }

  // Origem (formulário) e timeline — apenas para este lead
  const [{ data: submissionRaw }, { data: activitiesRaw }] = await Promise.all([
    supabase
      .from("form_submissions")
      .select("id,form_id,raw_data,created_at, form:forms(id,name,slug,is_active)")
      .eq("deal_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("activity_logs")
      .select("*, actor:profiles(first_name,last_name)")
      .eq("deal_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const submission = submissionRaw as unknown as
    | (FormSubmission & { form: Pick<Form, "id" | "name" | "slug" | "is_active"> | null })
    | null;
  const activities = (activitiesRaw ?? []) as unknown as ActivityLog[];
  const recent = (recentRaw ?? []) as unknown as Deal[];

  const minutesSince = Math.max(
    0,
    Math.round((now.getTime() - new Date(lead.created_at).getTime()) / 60000)
  );
  const elapsed =
    minutesSince < 60
      ? `${minutesSince} min`
      : minutesSince < 1440
        ? `${Math.floor(minutesSince / 60)} h`
        : `${Math.floor(minutesSince / 1440)} d`;

  const channel = submission
    ? "Formulário"
    : lead.source?.toLowerCase().includes("whatsapp")
      ? "WhatsApp"
      : lead.source
        ? lead.source
        : "Manual";

  // Campos do formulário: pares chave/valor já sanitizados na submissão
  const answers = Object.entries((submission?.raw_data ?? {}) as Record<string, unknown>)
    .filter(([key]) => !key.startsWith("utm_"))
    .slice(0, 12);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Último lead recebido"
        subtitle="Veja rapidamente os dados do lead mais recente da empresa"
        actions={
          <Link href="/relatorios" className={buttonClasses({ variant: "outline" })}>
            <ArrowRight className="h-4 w-4" />
            Relatório de entrada
          </Link>
        }
      />

      {/* Cabeçalho do lead */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar name={lead.contact?.name ?? lead.title} src={lead.contact?.avatar_url} size="xl" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-2xl font-bold tracking-tight text-ink">
                {lead.contact?.name ?? lead.title}
              </h2>
              <DealStatusBadge status={lead.status} />
              <TemperatureBadge temperature={lead.temperature} />
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
              <Fact
                icon={<CalendarClock className="h-4 w-4 text-primary-500" />}
                label="Recebido em"
                value={formatDateTime(lead.created_at)}
              />
              <Fact
                icon={<FileText className="h-4 w-4 text-primary-500" />}
                label="Formulário"
                value={submission?.form?.name ?? "—"}
              />
              <Fact
                icon={<Filter className="h-4 w-4 text-primary-500" />}
                label="Funil"
                value={lead.pipeline?.name ?? "—"}
              />
              <Fact
                icon={<Filter className="h-4 w-4 text-primary-500" />}
                label="Etapa"
                value={
                  lead.stage ? <Badge tone="green">{lead.stage.name}</Badge> : "—"
                }
              />
              <Fact
                icon={<UserRound className="h-4 w-4 text-primary-500" />}
                label="Responsável"
                value={fullName(lead.responsible)}
              />
              <Fact
                icon={<Globe className="h-4 w-4 text-primary-500" />}
                label="Canal"
                value={channel}
              />
              <Fact
                icon={<Star className="h-4 w-4 text-primary-500" />}
                label="Valor"
                value={
                  <span className="font-semibold text-emerald-600">
                    {formatCurrency(lead.value)}
                  </span>
                }
              />
              <Fact
                icon={<Clock className="h-4 w-4 text-primary-500" />}
                label="Tempo desde o recebimento"
                value={elapsed}
              />
            </dl>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-52">
            <Link
              href={`/negociacoes/${lead.id}`}
              className={buttonClasses({ className: "w-full" })}
            >
              Ver detalhes do lead
            </Link>
            {lead.contact?.whatsapp_phone && (
              <Link
                href={`/atendimento?telefone=${lead.contact.whatsapp_phone}`}
                className={buttonClasses({ variant: "outline", className: "w-full" })}
              >
                <MessageCircle className="h-4 w-4" />
                Abrir atendimento
              </Link>
            )}
          </div>
        </div>
      </Card>

      {/* Indicadores complementares */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Leads hoje" value={todayCount.count ?? 0} tone="blue" />
        <StatCard
          label="Tempo desde o recebimento"
          value={<span className="text-2xl">{elapsed}</span>}
          tone="amber"
        />
        <StatCard label="Canal de entrada" value={<span className="text-xl">{channel}</span>} tone="slate" />
        <StatCard
          label="Formulário ativo"
          sublabel={submission?.form?.name ?? "sem formulário"}
          value={
            <span className="text-xl">
              {submission ? (submission.form?.is_active ? "Sim" : "Inativo") : "—"}
            </span>
          }
          tone={submission?.form?.is_active ? "green" : "slate"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Respostas do formulário */}
        <Card>
          <CardHeader title="Informações do lead" subtitle="Dados de contato e respostas" />
          <ul className="divide-y divide-line">
            {lead.contact?.email && (
              <InfoRow icon={<Mail className="h-4 w-4" />} label="E-mail" value={lead.contact.email} />
            )}
            {lead.contact?.whatsapp_phone && (
              <InfoRow
                icon={<MessageCircle className="h-4 w-4" />}
                label="WhatsApp"
                value={`+${lead.contact.whatsapp_phone}`}
              />
            )}
            {lead.contact?.city && (
              <InfoRow icon={<Globe className="h-4 w-4" />} label="Cidade" value={lead.contact.city} />
            )}
            {answers.map(([key, value]) => (
              <InfoRow key={key} label={key} value={String(value)} />
            ))}
            {!lead.contact?.email && !lead.contact?.whatsapp_phone && answers.length === 0 && (
              <li className="px-5 py-6 text-sm text-ink-faint">
                Este lead não trouxe dados adicionais.
              </li>
            )}
          </ul>
        </Card>

        {/* Origem e entrada */}
        <Card>
          <CardHeader title="Origem e entrada" subtitle="De onde este lead veio" />
          <ul className="divide-y divide-line">
            <InfoRow label="Empresa" value={session.organization.name} />
            <InfoRow label="Formulário" value={submission?.form?.name ?? "—"} />
            <InfoRow label="Canal" value={channel} />
            <InfoRow label="Data/hora de criação" value={formatDateTime(lead.created_at)} />
            <InfoRow label="Funil" value={lead.pipeline?.name ?? "—"} />
            <InfoRow label="Etapa de entrada" value={lead.stage?.name ?? "—"} />
            <InfoRow label="Origem declarada" value={lead.source ?? "—"} />
            {lead.utm_source && <InfoRow label="UTM source" value={lead.utm_source} />}
            {lead.utm_campaign && <InfoRow label="UTM campaign" value={lead.utm_campaign} />}
          </ul>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader
            title="Timeline do lead"
            subtitle={`${activities.length} atividade(s) recente(s)`}
            action={
              <Link
                href={`/negociacoes/${lead.id}`}
                className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                Ver tudo
                <ExternalLink className="h-3 w-3" />
              </Link>
            }
          />
          <ol className="space-y-4 p-5">
            {activities.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500 ring-4 ring-primary-50" />
                <div className="min-w-0">
                  <p className="text-xs text-ink-faint">{formatDateTime(a.created_at)}</p>
                  <p className="text-sm font-medium text-ink">{a.title}</p>
                  {a.description && (
                    <p className="text-xs text-ink-soft">{a.description}</p>
                  )}
                </div>
              </li>
            ))}
            {activities.length === 0 && (
              <li className="py-4 text-sm text-ink-faint">Sem atividades registradas.</li>
            )}
          </ol>
        </Card>
      </div>

      {/* Últimos leads */}
      <Card className="mt-4 overflow-hidden">
        <CardHeader
          title="Últimos leads recebidos"
          subtitle="Os seis mais recentes da empresa"
          action={
            <Link
              href="/relatorios"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              Ver todos
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50/80 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
                <th className="px-5 py-3.5 whitespace-nowrap">Recebido em</th>
                <th className="px-5 py-3.5 whitespace-nowrap">Lead</th>
                <th className="px-5 py-3.5 whitespace-nowrap">Funil / Etapa</th>
                <th className="px-5 py-3.5 whitespace-nowrap">Responsável</th>
                <th className="px-5 py-3.5 whitespace-nowrap">Valor</th>
                <th className="px-5 py-3.5 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recent.map((d) => (
                <tr key={d.id} className="transition-colors hover:bg-primary-50/40">
                  <td className="px-5 py-3.5 whitespace-nowrap text-ink-soft">
                    {formatDateTime(d.created_at)}
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/negociacoes/${d.id}`}
                      className="flex items-center gap-2.5 hover:text-primary-700"
                    >
                      <Avatar name={d.contact?.name ?? d.title} size="xs" />
                      <span className="max-w-40 truncate font-medium text-ink">
                        {d.contact?.name ?? d.title}
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="block max-w-40 truncate text-ink-soft">
                      {d.pipeline?.name ?? "—"}
                    </span>
                    <span className="block max-w-40 truncate text-xs text-ink-faint">
                      {d.stage?.name ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-ink-soft">
                    {fullName(d.responsible)}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap font-semibold text-ink">
                    {formatCurrency(d.value)}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <DealStatusBadge status={d.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-ink-faint">{label}</dt>
        <dd className="truncate text-sm font-semibold text-ink">{value}</dd>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      {icon && <span className="shrink-0 text-ink-faint">{icon}</span>}
      <span className="min-w-0 flex-1 truncate text-sm text-ink-soft capitalize">{label}</span>
      <span className="max-w-[55%] truncate text-right text-sm font-medium text-ink">{value}</span>
    </li>
  );
}
