import { IngestionHealthPanel } from "@/components/crm/ingestion-health-panel";
import { InstanceSettings } from "@/components/whatsapp/instance-settings";
import { MetaCloudSettings } from "@/components/whatsapp/meta-cloud-settings";
import { PageHeader } from "@/components/layout/page-header";
import { DesktopOnly } from "@/components/ui/desktop-only";
import { getIngestionHealth } from "@/lib/features/lead-ingestion/infrastructure/ingestion-health-query";
import { getInstanceForOrg, getMetaInstanceForOrg, toPublicInstance } from "@/lib/services/whatsapp";
import { getSessionContext } from "@/lib/services/session";
import { buildWebhookUrl } from "@/lib/services/webhook-secret";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const metadata = { title: "Configurações WhatsApp" };
export const dynamic = "force-dynamic";

export default async function ConfiguracoesWhatsAppPage() {
  const session = await getSessionContext();
  const instance = await getInstanceForOrg(session.organization.id);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Guarda de papel: a URL do webhook carrega o segredo da instância, que
  // autentica quem escreve nesta organização. Antes ela era montada com o
  // `UAZAPI_WEBHOOK_SECRET` global e entregue a qualquer membro — um `viewer`
  // saía da tela com a chave que valia para a base inteira. Agora o segredo é
  // por instância (0010) e só administradores da empresa o veem.
  const canManageWebhook =
    session.membership.role === "org_admin" || session.profile.is_global_admin;

  // A URL só é calculada quando há permissão: sem isso o segredo entraria no
  // payload do Server Component mesmo que a tela não o desenhasse.
  const webhookUrl =
    canManageWebhook && instance?.webhook_secret
      ? buildWebhookUrl(appUrl, session.organization.id, instance.webhook_secret)
      : null;

  // Saúde da entrada: só para quem enxerga a organização inteira.
  //
  // `seller`/`agent` ficam de fora por decisão, não por esquecimento. Desde a
  // 0011 eles leem apenas as próprias conversas, então a consulta devolveria
  // "12 dias sem receber" para um vendedor num dia quieto, com a empresa
  // recebendo normalmente. Indicador de organização calculado com visão
  // parcial é alarme falso por construção — e alarme falso mata o alarme.
  const canSeeHealth =
    session.membership.role === "org_admin" ||
    session.membership.role === "viewer" ||
    session.profile.is_global_admin;

  // Instância da API oficial da Meta: só para quem administra. O token nunca
  // sai do servidor; o verify token (segredo da instância) só para org_admin.
  const metaInstance = canManageWebhook ? await getMetaInstanceForOrg(session.organization.id) : null;

  const supabase = await createClient();
  const health = canSeeHealth
    ? await getIngestionHealth(supabase, session.organization.id)
    : null;

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="Atendimento"
        title="Conexão WhatsApp"
        subtitle="Configure a UAZAPI, a API oficial da Meta e o webhook de mensagens"
        actions={
          <Link
            href="/atendimento"
            className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-primary-700"
          >
            ← Voltar ao atendimento
          </Link>
        }
      />
      <DesktopOnly description="A conexão do WhatsApp (credenciais, QR Code e webhook) é configurada pelo computador. No celular, use o Atendimento para conversar.">
      {/* Antes do formulário de propósito: quem chega nesta tela porque
          "parou de chegar mensagem" precisa ver o estado antes de mexer na
          configuração. */}
      {health && (
        <div className="mb-4">
          <IngestionHealthPanel healths={health.all} canFix={canManageWebhook} />
        </div>
      )}
      <InstanceSettings
        organizationId={session.organization.id}
        instance={toPublicInstance(instance)}
        webhookUrl={webhookUrl}
        canManageWebhook={canManageWebhook}
      />
      <MetaCloudSettings
        canManage={canManageWebhook}
        callbackUrl={`${appUrl.replace(/\/$/, "")}/api/webhooks/meta`}
        verifyToken={metaInstance?.webhook_secret ?? null}
        instance={
          metaInstance
            ? {
                name: metaInstance.name,
                phone_number_id: metaInstance.phone_number_id ?? null,
                business_account_id: metaInstance.business_account_id ?? null,
                display_phone: metaInstance.display_phone ?? null,
                has_token: Boolean(metaInstance.token_encrypted),
                status: metaInstance.status,
              }
            : null
        }
      />
      </DesktopOnly>
    </div>
  );
}
