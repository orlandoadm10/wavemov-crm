import { AiWorkspace } from "@/components/ai/ai-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { isEmbeddingConfigured } from "@/lib/features/ai-agent/infrastructure/embeddings";
import { isLlmConfigured, llmConfig } from "@/lib/features/ai-agent/infrastructure/llm-client";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { AiRunRow } from "@/components/ai/ai-runs-table";
import type { AiAgent, KnowledgeDocument } from "@/types";
import { Lock, Plug } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "IA" };
export const dynamic = "force-dynamic";

export default async function IaPage() {
  const session = await getSessionContext();
  const canManage = session.membership.role === "org_admin" || session.profile.is_global_admin;

  if (!canManage) {
    return (
      <div className="animate-fade-up">
        <PageHeader eyebrow="Inteligência" title="IA" subtitle="Agentes que atendem pelo WhatsApp" />
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title="Restrito ao administrador da empresa"
          description="A configuração dos agentes de IA decide como os leads são atendidos. Peça ao administrador se precisar de alguma mudança."
          action={
            <Link href="/atendimento" className={buttonClasses({ variant: "outline" })}>
              Ir para o atendimento
            </Link>
          }
        />
      </div>
    );
  }

  const supabase = await createClient();
  const orgId = session.organization.id;
  const since = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();

  const [agentsRes, docsRes, runsRes, weekRes] = await Promise.all([
    supabase.from("ai_agents").select("*").eq("organization_id", orgId).order("created_at"),
    supabase
      .from("knowledge_documents")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("ai_runs")
      .select("*, conversation:whatsapp_conversations(name, phone)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("ai_runs").select("status").eq("organization_id", orgId).gte("created_at", since).limit(5000),
  ]);

  const loadError = [agentsRes.error, docsRes.error, runsRes.error].find(Boolean);
  const week = (weekRes.data ?? []) as { status: string }[];
  const count = (status: string) => week.filter((r) => r.status === status).length;

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="Inteligência"
        title="IA"
        subtitle="Agentes que atendem, qualificam e atualizam o CRM pelo WhatsApp"
        actions={
          <Link href="/integracoes" className={buttonClasses({ variant: "outline" })}>
            <Plug className="h-4 w-4" /> Integrações e MCP
          </Link>
        }
      />

      {!isLlmConfigured() && (
        <p className="mb-4 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-text">
          A chave do modelo de IA ainda não foi configurada no servidor (variável <code>AI_API_KEY</code>).
          Os agentes podem ser configurados, mas só respondem depois disso.
        </p>
      )}
      {loadError && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">
          Não foi possível carregar tudo desta tela. Se as migrations 0026–0029 ainda não foram aplicadas,
          aplique-as e recarregue.
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Turnos da IA" sublabel="Últimos 7 dias" value={week.length} tone="blue" />
        <StatCard label="Respondidos" sublabel="Últimos 7 dias" value={count("success")} tone="green" />
        <StatCard label="Transferidos" sublabel="Para a equipe" value={count("handoff")} tone="amber" />
        <StatCard label="Falhas" sublabel="Últimos 7 dias" value={count("error")} tone="red" />
      </div>

      <AiWorkspace
        agents={(agentsRes.data ?? []) as AiAgent[]}
        documents={(docsRes.data ?? []) as KnowledgeDocument[]}
        runs={(runsRes.data ?? []) as AiRunRow[]}
        defaultModel={llmConfig().defaultModel}
        embeddingsReady={isEmbeddingConfigured()}
      />
    </div>
  );
}
