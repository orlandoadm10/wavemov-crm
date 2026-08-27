import { PeriodFilter } from "@/components/crm/period-filter";
import { SellerPerformanceTable } from "@/components/crm/seller-performance-table";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/card";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";
import { resolvePeriod } from "@/lib/utils/period";
import type { Profile } from "@/types";
import { ArrowLeft, Scale, Target, UserRound, Users } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Rendimento por vendedor" };
export const dynamic = "force-dynamic";

type Search = Promise<{ periodo?: string }>;

/** O que a tabela precisa saber de cada pessoa. */
export interface SellerRow {
  profileId: string;
  name: string;
  jobTitle: string | null;
  role: string;
  /** Leads consecutivos somados nas regras ativas; `null` quando fora de todas. */
  weight: number | null;
  /** Plantão: fora dele a pessoa é pulada na fila (0017). */
  onDuty: boolean;
  received: number;
  won: number;
  lost: number;
  open: number;
  /** Ganhos ÷ fechados (ganhos + perdidos). `null` quando nada fechou. */
  conversion: number | null;
  wonValue: number;
  tasksPending: number;
  tasksOverdue: number;
  notes: number;
}

export default async function RendimentoPorVendedorPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { periodo } = await searchParams;
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const period = resolvePeriod(periodo, new Date());
  const fromISO = period.from.toISOString();
  const toISO = period.to.toISOString();

  // Este relatório é de gestão: mostra o desempenho de TODA a equipe. Quem não
  // enxerga os leads dos outros (0011) não deveria enxergar os números deles.
  // A guarda é a mesma função que o banco usa para decidir a visibilidade.
  const canSeeTeam =
    session.membership.role === "org_admin" ||
    session.membership.role === "viewer" ||
    session.profile.is_global_admin;

  if (!canSeeTeam) {
    return (
      <div className="animate-fade-up">
        <PageHeader
          title="Rendimento por vendedor"
          subtitle="Distribuição e desempenho da equipe"
        />
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Disponível para administradores"
          description="Este relatório mostra os números de toda a equipe. Seu perfil enxerga apenas os próprios leads."
          action={
            <Link href="/negociacoes" className={buttonClasses({ variant: "outline" })}>
              Ir para minhas negociações
            </Link>
          }
        />
      </div>
    );
  }

  const [
    { data: membersRaw },
    { data: dealsRaw },
    { data: tasksRaw },
    { data: notesRaw },
    { data: participantsRaw },
  ] = await Promise.all([
    supabase
      .from("organization_members")
      .select("role, on_duty, profile:profiles(*)")
      .eq("organization_id", orgId)
      .eq("is_active", true),
    // Só as colunas que entram na conta. `created_at` recorta o período de
    // ENTRADA do lead: o relatório responde "dos leads que entraram no período,
    // como cada vendedor se saiu", que é a pergunta que o rodízio levanta.
    supabase
      .from("deals")
      .select("responsible_id, status, value")
      .eq("organization_id", orgId)
      .gte("created_at", fromISO)
      .lte("created_at", toISO),
    supabase
      .from("tasks")
      .select("assigned_to, status, due_at")
      .eq("organization_id", orgId)
      .eq("status", "pending"),
    supabase
      .from("activity_logs")
      .select("actor_id")
      .eq("organization_id", orgId)
      .eq("type", "note")
      .gte("created_at", fromISO)
      .lte("created_at", toISO),
    // Peso vigente: soma dos pesos do participante nas regras ATIVAS. Um
    // vendedor pode estar em mais de uma regra (a padrão e a de uma campanha).
    supabase
      .from("lead_distribution_participants")
      .select("profile_id, weight, is_active, rule:lead_distribution_rules!inner(organization_id, is_active)")
      .eq("is_active", true)
      .eq("rule.organization_id", orgId)
      .eq("rule.is_active", true),
  ]);

  const members = (
    (membersRaw ?? []) as unknown as { role: string; on_duty: boolean; profile: Profile }[]
  ).filter((m) => m.profile);

  const agora = new Date();
  const porPessoa = new Map<string, SellerRow>();

  for (const membro of members) {
    porPessoa.set(membro.profile.id, {
      profileId: membro.profile.id,
      name: fullName(membro.profile),
      jobTitle: membro.profile.job_title ?? null,
      role: membro.role,
      onDuty: membro.on_duty,
      weight: null,
      received: 0,
      won: 0,
      lost: 0,
      open: 0,
      conversion: null,
      wonValue: 0,
      tasksPending: 0,
      tasksOverdue: 0,
      notes: 0,
    });
  }

  for (const p of (participantsRaw ?? []) as { profile_id: string; weight: number }[]) {
    const linha = porPessoa.get(p.profile_id);
    if (linha) linha.weight = (linha.weight ?? 0) + p.weight;
  }

  // Leads sem responsável não pertencem a ninguém, mas precisam aparecer: é o
  // número que denuncia configuração de distribuição incompleta.
  let semResponsavel = 0;

  for (const deal of (dealsRaw ?? []) as {
    responsible_id: string | null;
    status: string;
    value: number | null;
  }[]) {
    if (!deal.responsible_id) {
      semResponsavel++;
      continue;
    }
    const linha = porPessoa.get(deal.responsible_id);
    if (!linha) continue;
    linha.received++;
    if (deal.status === "won") {
      linha.won++;
      linha.wonValue += Number(deal.value ?? 0);
    } else if (deal.status === "lost") linha.lost++;
    else if (deal.status === "open") linha.open++;
  }

  for (const tarefa of (tasksRaw ?? []) as { assigned_to: string | null; due_at: string | null }[]) {
    if (!tarefa.assigned_to) continue;
    const linha = porPessoa.get(tarefa.assigned_to);
    if (!linha) continue;
    linha.tasksPending++;
    if (tarefa.due_at && new Date(tarefa.due_at) < agora) linha.tasksOverdue++;
  }

  for (const nota of (notesRaw ?? []) as { actor_id: string | null }[]) {
    if (!nota.actor_id) continue;
    const linha = porPessoa.get(nota.actor_id);
    if (linha) linha.notes++;
  }

  // Conversão sobre o que FECHOU, não sobre o total recebido: lead ainda em
  // aberto não é fracasso, e dividir por ele puniria quem acabou de receber.
  for (const linha of porPessoa.values()) {
    const fechados = linha.won + linha.lost;
    linha.conversion = fechados > 0 ? linha.won / fechados : null;
  }

  const linhas = [...porPessoa.values()]
    .filter((l) => l.role !== "viewer" || l.received > 0)
    .sort((a, b) => b.received - a.received || a.name.localeCompare(b.name));

  const totalRecebidos = linhas.reduce((soma, l) => soma + l.received, 0);
  // Estar na fila não basta: fora do plantão a pessoa é pulada. O número que
  // interessa ao administrador é quantos podem receber AGORA.
  const noRodizio = linhas.filter((l) => l.weight !== null && l.onDuty).length;
  const foraDoPlantao = linhas.filter((l) => l.weight !== null && !l.onDuty).length;
  const totalGanhos = linhas.reduce((soma, l) => soma + l.won, 0);
  const totalFechados = linhas.reduce((soma, l) => soma + l.won + l.lost, 0);

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        title="Rendimento por vendedor"
        subtitle={`Distribuição e desempenho da equipe · ${period.label}`}
        actions={
          <>
            <PeriodFilter />
            <Link href="/distribuicao" className={buttonClasses({ variant: "outline" })}>
              <Scale className="h-4 w-4" />
              Configurar distribuição
            </Link>
            <Link href="/relatorios" className={buttonClasses({ variant: "outline" })}>
              <ArrowLeft className="h-4 w-4" />
              Relatórios
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Leads distribuídos"
          sublabel="no período"
          value={totalRecebidos}
          tone="blue"
          icon={<UserRound className="h-5 w-5 text-primary-500" />}
        />
        <StatCard
          label="Sem responsável"
          sublabel="entraram e ninguém recebeu"
          value={semResponsavel}
          tone={semResponsavel > 0 ? "red" : "green"}
          hint={
            semResponsavel > 0 ? (
              <Link href="/distribuicao" className="font-medium text-primary-700 hover:underline">
                Revisar a configuração →
              </Link>
            ) : (
              "Todo lead do período tem dono"
            )
          }
          icon={<Users className="h-5 w-5 text-rose-500" />}
        />
        <StatCard
          label="De plantão"
          sublabel="na fila e podendo receber agora"
          value={noRodizio}
          tone={noRodizio === 0 ? "red" : "slate"}
          hint={foraDoPlantao > 0 ? `${foraDoPlantao} na fila, fora do plantão` : undefined}
          icon={<Scale className="h-5 w-5 text-slate-400" />}
        />
        <StatCard
          label="Conversão da equipe"
          sublabel="sobre os leads fechados"
          value={totalFechados > 0 ? `${Math.round((totalGanhos / totalFechados) * 100)}%` : "—"}
          tone="green"
          hint={`${totalGanhos} ganho(s) de ${totalFechados} fechado(s)`}
          icon={<Target className="h-5 w-5 text-emerald-500" />}
        />
      </div>

      {linhas.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Nenhum membro ativo na equipe"
          description="Cadastre pessoas para que os leads possam ser distribuídos."
          action={
            <Link href="/pessoas" className={buttonClasses()}>
              Ir para Pessoas
            </Link>
          }
        />
      ) : (
        <SellerPerformanceTable rows={linhas} />
      )}
    </div>
  );
}
