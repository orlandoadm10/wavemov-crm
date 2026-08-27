import {
  DistributionClient,
  type DistributionRuleRow,
} from "@/components/crm/distribution-client";
import type { AuditEntry } from "@/components/crm/distribution-audit-table";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";
import type { Profile } from "@/types";
import { BarChart3, Lock } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Distribuição de leads" };
export const dynamic = "force-dynamic";

/** Quantas decisões recentes a auditoria mostra sem paginar. */
const AUDIT_PAGE_SIZE = 50;

export default async function DistribuicaoPage() {
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const canManage =
    session.membership.role === "org_admin" || session.profile.is_global_admin;

  if (!canManage) {
    return (
      <div className="animate-fade-up">
        <PageHeader
          title="Distribuição de leads"
          subtitle="Quem recebe cada lead que entra"
        />
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title="Restrito ao administrador da empresa"
          description="A configuração da distribuição decide quem atende cada lead. Peça ao administrador se precisar de alguma mudança."
          action={
            <Link href="/negociacoes" className={buttonClasses({ variant: "outline" })}>
              Ir para minhas negociações
            </Link>
          }
        />
      </div>
    );
  }

  const [{ data: rulesRaw }, { data: membersRaw }, { data: formsRaw }, { data: logRaw }] =
    await Promise.all([
      supabase
        .from("lead_distribution_rules")
        .select(
          "*, participants:lead_distribution_participants(id, profile_id, weight, is_active, profile:profiles(id, first_name, last_name))"
        )
        .eq("organization_id", orgId)
        .order("is_fallback")
        .order("priority"),
      supabase
        .from("organization_members")
        .select("role, profile:profiles(*)")
        .eq("organization_id", orgId)
        .eq("is_active", true),
      supabase
        .from("forms")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("name"),
      // Auditoria: só a janela recente. O histórico completo cresce por lead e
      // não cabe numa tela sem paginação — que entra quando alguém precisar.
      supabase
        .from("lead_distribution_log")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(AUDIT_PAGE_SIZE),
    ]);

  // `viewer` não pode receber lead (a 0016 recusa no banco), então nem aparece
  // como opção: botão que o banco vai recusar não deve existir na tela.
  const elegiveis = ((membersRaw ?? []) as unknown as { role: string; profile: Profile }[])
    .filter((m) => m.profile && m.role !== "viewer")
    .map((m) => ({ id: m.profile.id, name: fullName(m.profile), role: m.role }));

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        title="Distribuição de leads"
        subtitle="Quem recebe cada lead que entra, por origem e formulário"
        actions={
          <Link
            href="/relatorios/vendedores"
            className={buttonClasses({ variant: "outline" })}
          >
            <BarChart3 className="h-4 w-4" />
            Rendimento por vendedor
          </Link>
        }
      />
      <DistributionClient
        rules={(rulesRaw ?? []) as unknown as DistributionRuleRow[]}
        members={elegiveis}
        forms={(formsRaw ?? []) as { id: string; name: string }[]}
        auditEntries={(logRaw ?? []) as unknown as AuditEntry[]}
        auditPageSize={AUDIT_PAGE_SIZE}
      />
    </div>
  );
}
