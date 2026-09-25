import { ApiTokensPanel } from "@/components/integrations/api-tokens-panel";
import { CopyField } from "@/components/integrations/copy-field";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { ApiToken } from "@/types";
import { Lock } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Integrações" };
export const dynamic = "force-dynamic";

// Caminhos RELATIVOS à URL base (que já termina em `/api/v1`). A tela
// mostrava `/api/v1/...` aqui E na base; quem juntava os dois chamava
// `/api/v1/api/v1/pipelines` e recebia 404 — foi o que o cliente encontrou no
// n8n em 23/09/2026. A URL completa de cada linha é montada abaixo.
const ENDPOINTS: { method: string; path: string; description: string }[] = [
  { method: "GET", path: "/contacts?q=", description: "Buscar contatos por nome, e-mail ou telefone" },
  { method: "GET", path: "/pipelines", description: "Funis e etapas (ids para mover leads)" },
  { method: "GET", path: "/deals", description: "Listar negociações (status, stage_id, pipeline_id, q)" },
  { method: "POST", path: "/deals", description: "Criar lead: contato + negociação + distribuição" },
  { method: "GET", path: "/deals/:id", description: "Contexto completo do lead" },
  { method: "PATCH", path: "/deals/:id", description: "Mover etapa (stage_id/stage_name) e atualizar campos" },
  { method: "POST", path: "/messages", description: "Enviar WhatsApp (conversation_id ou deal_id + text)" },
  { method: "POST", path: "/tools/:nome", description: "Qualquer ferramenta: add_note, create_task, save_qualification…" },
];

export default async function IntegracoesPage() {
  const session = await getSessionContext();
  const canManage = session.membership.role === "org_admin" || session.profile.is_global_admin;
  if (!canManage) {
    return (
      <div className="animate-fade-up">
        <PageHeader eyebrow="Inteligência" title="Integrações" subtitle="API, MCP, n8n e webhooks" />
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title="Restrito ao administrador da empresa"
          description="Tokens de API dão acesso aos dados da empresa. Peça ao administrador se precisar integrar algum sistema."
          action={
            <Link href="/dashboard" className={buttonClasses({ variant: "outline" })}>
              Voltar ao dashboard
            </Link>
          }
        />
      </div>
    );
  }

  const supabase = await createClient();
  const { data: tokens, error } = await supabase
    .from("api_tokens")
    .select("id, organization_id, name, token_prefix, scopes, last_used_at, expires_at, revoked_at, created_at")
    .eq("organization_id", session.organization.id)
    .order("created_at", { ascending: false });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") || "https://SEU-DOMINIO";
  const apiBase = `${appUrl}/api/v1`;
  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        "crm-jid-midia": {
          type: "http",
          url: `${appUrl}/api/mcp`,
          headers: { Authorization: "Bearer jid_SEU_TOKEN" },
        },
      },
    },
    null,
    2
  );

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader eyebrow="Inteligência" title="Integrações" subtitle="Conecte o CRM ao n8n, a sistemas externos e a agentes via MCP" />

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Não foi possível carregar os tokens. Se a migration 0029 ainda não foi aplicada, aplique-a e recarregue.
        </p>
      )}

      <ApiTokensPanel tokens={(tokens ?? []) as ApiToken[]} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="API REST (n8n e sistemas externos)" subtitle="Cabeçalho: Authorization: Bearer jid_…" />
          <div className="space-y-3 p-5">
            <CopyField label="URL base" value={apiBase} />
            <p className="text-xs text-ink-faint">
              Cada endpoint abaixo vai <strong>depois</strong> da URL base. Exemplo: URL base +{" "}
              <code>/pipelines</code> = <code className="break-all">{apiBase}/pipelines</code>
            </p>
            <ul className="divide-y divide-line rounded-xl border border-line text-sm">
              {ENDPOINTS.map((e) => (
                <li key={`${e.method} ${e.path}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
                  <span className="w-14 shrink-0 font-mono text-xs font-semibold text-primary-700">{e.method}</span>
                  <code className="text-xs text-ink">{e.path}</code>
                  <span className="w-full text-xs text-ink-faint sm:w-auto">{e.description}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-xl border border-line bg-slate-50 p-3">
              <p className="mb-2 text-[13px] font-medium text-ink-soft">Teste rápido no n8n (nó HTTP Request)</p>
              <dl className="space-y-1 text-xs text-ink">
                <div className="flex gap-2"><dt className="w-24 shrink-0 text-ink-faint">Method</dt><dd>GET</dd></div>
                <div className="flex gap-2"><dt className="w-24 shrink-0 text-ink-faint">URL</dt><dd className="break-all font-mono">{apiBase}/pipelines</dd></div>
                <div className="flex gap-2"><dt className="w-24 shrink-0 text-ink-faint">Header</dt><dd className="break-all font-mono">Authorization: Bearer jid_SEU_TOKEN</dd></div>
              </dl>
              <p className="mt-2 text-xs text-ink-faint">
                Use um token com o escopo <strong>API</strong>. Respostas: 200 com os funis = tudo certo; 401 = token
                ausente, errado ou revogado; 404 = caminho errado (confira se <code>/api/v1</code> não aparece duas vezes).
              </p>
            </div>
            <p className="text-xs text-ink-faint">
              Para receber leads do Typeform, do site ou de qualquer ferramenta com webhook, use{" "}
              <Link href="/fontes" className="font-medium text-primary-600 hover:text-primary-700">
                Fontes de lead
              </Link>{" "}
              — sem n8n no meio. Fluxos antigos continuam em <code>/api/ingest/leads</code> (painel em Formulários).
              Para reagir a eventos do CRM no n8n, use a ação &quot;Chamar webhook&quot; em Automações.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="MCP (Model Context Protocol)" subtitle="Claude, n8n (MCP Client) e agentes próprios" />
          <div className="space-y-3 p-5">
            <CopyField label="Endpoint MCP (Streamable HTTP)" value={`${appUrl}/api/mcp`} />
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink-soft">Configuração do cliente</p>
              <pre className="overflow-x-auto rounded-xl border border-line bg-slate-50 p-3 text-xs text-ink">{mcpConfig}</pre>
            </div>
            <p className="text-xs text-ink-faint">
              Ferramentas expostas: buscar contatos, listar funis e negociações, criar lead, ler contexto, atualizar
              contato e negociação, mover etapa, notas, tarefas, qualificação, base de conhecimento, transferir para
              humano e enviar WhatsApp. Tudo restrito à empresa do token.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="WhatsApp — API oficial da Meta" subtitle="Configure no painel do app da Meta" />
          <div className="space-y-3 p-5">
            <CopyField label="URL de callback" value={`${appUrl}/api/webhooks/meta`} />
            <p className="text-xs text-ink-faint">
              Token de verificação: o segredo do webhook da instância, exibido em Atendimento → Configurações. Assine o
              campo <code>messages</code>. O servidor precisa de <code>META_APP_SECRET</code> para validar a assinatura.
            </p>
            <Link href="/atendimento/configuracoes" className={buttonClasses({ variant: "outline", size: "sm" })}>
              Abrir configurações do WhatsApp
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader title="Relógio das automações" subtitle="Follow-ups e ações com atraso" />
          <div className="space-y-3 p-5">
            <CopyField label="Endpoint" value={`${appUrl}/api/cron/automations`} />
            <p className="text-xs text-ink-faint">
              Chame a cada 1–5 minutos com <code>Authorization: Bearer CRON_SECRET</code> (nó Schedule + HTTP Request no
              n8n, ou Vercel Cron). Eventos do Kanban e do WhatsApp já são processados na hora; o relógio cuida da régua
              de follow-up e das automações com espera.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
