import { DailyLeadsChart, HorizontalCountChart } from "@/components/crm/dashboard-charts";
import { PeriodFilter } from "@/components/crm/period-filter";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { resolvePeriod } from "@/lib/utils/period";
import type { DealTagEvolutionPoint, DealTagResponsibleTotal, DealTagTotal } from "@/types";
import { ArrowLeft, BarChart3, Tags, TrendingUp } from "lucide-react";
import Link from "next/link";
import { eachDayOfInterval, format } from "date-fns";

export const metadata = { title: "Relatório de tags" };
export const dynamic = "force-dynamic";

type Search = Promise<{ periodo?: string; tag?: string }>;

export default async function TagsReportPage({ searchParams }: { searchParams: Search }) {
  const { periodo, tag } = await searchParams;
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;
  const period = resolvePeriod(periodo);
  const fromISO = period.from.toISOString();
  // As RPCs usam limite superior exclusivo (`created_at < period_to`).
  const toISO = new Date(period.to.getTime() + 1).toISOString();
  const canViewTeam =
    session.profile.is_global_admin ||
    session.membership.role === "org_admin" ||
    session.membership.role === "viewer";
  const canManageTags =
    session.profile.is_global_admin || session.membership.role === "org_admin";

  const [{ data: totalsRaw, error: totalsError }, responsibleResult] = await Promise.all([
    supabase.rpc("deal_tag_totals", {
      org_id: orgId,
      period_from: fromISO,
      period_to: toISO,
    }),
    canViewTeam
      ? supabase.rpc("deal_tag_by_responsible", {
          org_id: orgId,
          period_from: fromISO,
          period_to: toISO,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (totalsError) console.error("Falha ao carregar totais por tag", { organizationId: orgId, totalsError });
  if (responsibleResult.error) {
    console.error("Falha ao carregar tags por responsável", {
      organizationId: orgId,
      error: responsibleResult.error,
    });
  }

  const totals = ((totalsRaw ?? []) as unknown as DealTagTotal[]).map(normalizeTotal);
  const selectedTagId = totals.some((item) => item.tag_id === tag) ? tag! : totals[0]?.tag_id ?? null;
  const selectedTag = totals.find((item) => item.tag_id === selectedTagId) ?? null;

  const { data: evolutionRaw, error: evolutionError } = selectedTagId
    ? await supabase.rpc("deal_tag_evolution", {
        org_id: orgId,
        period_from: fromISO,
        period_to: toISO,
        target_tag: selectedTagId,
        bucket: "day",
        tz: "America/Sao_Paulo",
      })
    : { data: [], error: null };

  if (evolutionError) {
    console.error("Falha ao carregar evolução da tag", { organizationId: orgId, tagId: selectedTagId, evolutionError });
  }

  const evolutionByDay = new Map(
    ((evolutionRaw ?? []) as unknown as DealTagEvolutionPoint[]).map((point) => [
      point.bucket_start,
      Number(point.deals_total),
    ])
  );
  const evolution = eachDayOfInterval({ start: period.from, end: period.to }).map((day) => ({
    label: format(day, "dd/MM"),
    total: evolutionByDay.get(format(day, "yyyy-MM-dd")) ?? 0,
  }));
  const responsible = ((responsibleResult.data ?? []) as unknown as DealTagResponsibleTotal[])
    .filter((item) => !selectedTagId || item.tag_id === selectedTagId)
    .map((item) => ({
      name: item.responsible_name || "Sem responsável",
      value: Number(item.deals_total),
    }));

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Relatório de tags"
        subtitle="Uso operacional das tags nas negociações do período"
        actions={
          <>
            <PeriodFilter />
            {canManageTags && (
              <Link href="/tags" className={buttonClasses({ variant: "outline" })}>
                <Tags className="h-4 w-4" /> Catálogo
              </Link>
            )}
            <Link href="/relatorios" className={buttonClasses({ variant: "outline" })}>
              <ArrowLeft className="h-4 w-4" /> Relatórios
            </Link>
          </>
        }
      />

      {(totalsError || evolutionError || responsibleResult.error) && (
        <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Não foi possível carregar todas as métricas de tags. Tente novamente.
        </p>
      )}

      {totalsError ? (
        <EmptyState
          icon={<Tags className="h-6 w-6" />}
          title="Não foi possível carregar as métricas"
          description="Atualize a página para tentar novamente."
        />
      ) : totals.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-6 w-6" />}
          title="Nenhuma tag cadastrada"
          description="As métricas aparecem depois que a empresa cria e aplica tags às negociações."
          action={canManageTags ? <Link href="/tags" className={buttonClasses()}>Criar tag</Link> : undefined}
        />
      ) : (
        <>
          <form className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-white p-3 shadow-(--shadow-card)">
            {periodo && <input type="hidden" name="periodo" value={periodo} />}
            <label className="min-w-56 flex-1 text-xs font-medium text-ink-soft">
              Tag analisada
              <Select name="tag" defaultValue={selectedTagId ?? ""} className="mt-1">
                {totals.map((item) => <option key={item.tag_id} value={item.tag_id}>{item.name}</option>)}
              </Select>
            </label>
            <Button type="submit" variant="outline">Aplicar tag</Button>
          </form>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Negociações com a tag" value={selectedTag?.deals_total ?? 0} tone="blue" icon={<Tags className="h-5 w-5 text-primary-500" />} />
            <StatCard label="Em andamento" value={selectedTag?.deals_open ?? 0} tone="amber" icon={<TrendingUp className="h-5 w-5 text-amber-500" />} />
            <StatCard label="Ganhas" value={selectedTag?.deals_won ?? 0} tone="green" icon={<BarChart3 className="h-5 w-5 text-emerald-500" />} />
            <StatCard label="Valor ganho" value={formatCurrency(selectedTag?.value_won ?? 0)} tone="green" icon={<BarChart3 className="h-5 w-5 text-emerald-500" />} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Evolução no período" subtitle={selectedTag?.name ?? "Tag selecionada"} />
              <div className="p-4"><DailyLeadsChart data={evolution} height={260} /></div>
            </Card>
            <Card>
              <CardHeader title="Distribuição por responsável" subtitle={selectedTag?.name ?? "Tag selecionada"} />
              <div className="p-4">
                {canViewTeam ? (
                  <HorizontalCountChart data={responsible} />
                ) : (
                  <p className="py-16 text-center text-sm text-ink-faint">
                    Esta comparação está disponível para administradores e perfis com visão da equipe.
                  </p>
                )}
              </div>
            </Card>
          </div>

          <Card className="mt-4 overflow-hidden">
            <CardHeader title="Quantidade por tag" subtitle="Uma negociação com várias tags aparece em cada uma delas; não some as linhas como total de leads." />
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-slate-50/80 text-left text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
                  <tr><th className="px-5 py-3">Tag</th><th className="px-5 py-3">Categoria</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Abertas</th><th className="px-5 py-3 text-right">Ganhas</th><th className="px-5 py-3 text-right">Perdidas</th><th className="px-5 py-3 text-right">Valor ganho</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {totals.map((item) => (
                    <tr key={item.tag_id} className="hover:bg-primary-50/40">
                      <td className="px-5 py-3"><Badge tone={item.tone}>{item.name}</Badge>{!item.is_active && <span className="ml-2 text-xs text-ink-faint">inativa</span>}</td>
                      <td className="px-5 py-3 text-ink-soft">{item.category ?? "—"}</td>
                      <td className="px-5 py-3 text-right font-semibold text-ink">{item.deals_total}</td>
                      <td className="px-5 py-3 text-right text-ink-soft">{item.deals_open}</td>
                      <td className="px-5 py-3 text-right text-ink-soft">{item.deals_won}</td>
                      <td className="px-5 py-3 text-right text-ink-soft">{item.deals_lost}</td>
                      <td className="px-5 py-3 text-right font-semibold text-ink">{formatCurrency(item.value_won)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function normalizeTotal(item: DealTagTotal): DealTagTotal {
  return {
    ...item,
    deals_total: Number(item.deals_total),
    deals_open: Number(item.deals_open),
    deals_won: Number(item.deals_won),
    deals_lost: Number(item.deals_lost),
    value_won: Number(item.value_won),
  };
}
