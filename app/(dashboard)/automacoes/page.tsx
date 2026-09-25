import { AutomationsClient, type AutomationOptions, type AutomationRunRow } from "@/components/automations/automations-client";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";
import type { AutomationRule, Profile } from "@/types";
import { Lock, Plug } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Automações" };
export const dynamic = "force-dynamic";

export default async function AutomacoesPage() {
  const session = await getSessionContext();
  const canManage = session.membership.role === "org_admin" || session.profile.is_global_admin;

  if (!canManage) {
    return (
      <div className="animate-fade-up">
        <PageHeader eyebrow="Inteligência" title="Automações" subtitle="Ações automáticas do funil e do WhatsApp" />
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title="Restrito ao administrador da empresa"
          description="Automações enviam mensagens e movem leads em nome da empresa. Peça ao administrador se precisar de alguma mudança."
          action={
            <Link href="/negociacoes" className={buttonClasses({ variant: "outline" })}>
              Ir para minhas negociações
            </Link>
          }
        />
      </div>
    );
  }

  const supabase = await createClient();
  const orgId = session.organization.id;

  const [rulesRes, runsRes, pipelinesRes, membersRes, tagsRes] = await Promise.all([
    supabase.from("automation_rules").select("*").eq("organization_id", orgId).order("created_at"),
    supabase
      .from("automation_runs")
      .select("*, rule:automation_rules(name), deal:deals(id, title)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("pipelines")
      .select("id, name, stages:pipeline_stages(id, name, order_index)")
      .eq("organization_id", orgId)
      .order("created_at"),
    supabase
      .from("organization_members")
      .select("profile:profiles(id, first_name, last_name)")
      .eq("organization_id", orgId)
      .eq("is_active", true),
    supabase.from("deal_tags").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("name"),
  ]);

  const options: AutomationOptions = {
    pipelines: (pipelinesRes.data ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      stages: [...((p.stages as { id: string; name: string; order_index: number }[] | null) ?? [])].sort(
        (a, b) => a.order_index - b.order_index
      ),
    })),
    members: (membersRes.data ?? [])
      .map((m) => (Array.isArray(m.profile) ? m.profile[0] : m.profile) as Pick<Profile, "id" | "first_name" | "last_name"> | null)
      .filter((p): p is Pick<Profile, "id" | "first_name" | "last_name"> => Boolean(p))
      .map((p) => ({ id: p.id, name: fullName(p) || "Sem nome" })),
    tags: (tagsRes.data ?? []) as { id: string; name: string }[],
  };

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="Inteligência"
        title="Automações"
        subtitle="Quando algo acontece no funil ou no WhatsApp, o CRM age sozinho"
        actions={
          <Link href="/integracoes" className={buttonClasses({ variant: "outline" })}>
            <Plug className="h-4 w-4" /> Integrações e n8n
          </Link>
        }
      />
      {(rulesRes.error || runsRes.error) && (
        <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">
          Não foi possível carregar as automações. Se a migration 0028 ainda não foi aplicada, aplique-a e recarregue.
        </p>
      )}
      <AutomationsClient
        rules={(rulesRes.data ?? []) as AutomationRule[]}
        runs={(runsRes.data ?? []) as AutomationRunRow[]}
        options={options}
      />
    </div>
  );
}
