import { InstanceSettings } from "@/components/whatsapp/instance-settings";
import { PageHeader } from "@/components/layout/page-header";
import { getInstanceForOrg, toPublicInstance } from "@/lib/services/whatsapp";
import { getSessionContext } from "@/lib/services/session";
import { buildWebhookUrl } from "@/lib/services/webhook-secret";
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

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Conexão WhatsApp"
        subtitle="Configure sua instância UAZAPI e o webhook de mensagens"
        actions={
          <Link
            href="/atendimento"
            className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-primary-700"
          >
            ← Voltar ao atendimento
          </Link>
        }
      />
      <InstanceSettings
        organizationId={session.organization.id}
        instance={toPublicInstance(instance)}
        webhookUrl={webhookUrl}
        canManageWebhook={canManageWebhook}
      />
    </div>
  );
}
