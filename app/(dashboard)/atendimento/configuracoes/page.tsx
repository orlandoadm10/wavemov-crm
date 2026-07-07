import { InstanceSettings } from "@/components/whatsapp/instance-settings";
import { PageHeader } from "@/components/layout/page-header";
import { getInstanceForOrg, toPublicInstance } from "@/lib/services/whatsapp";
import { getSessionContext } from "@/lib/services/session";
import Link from "next/link";

export const metadata = { title: "Configurações WhatsApp" };
export const dynamic = "force-dynamic";

export default async function ConfiguracoesWhatsAppPage() {
  const session = await getSessionContext();
  const instance = await getInstanceForOrg(session.organization.id);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const secret = process.env.UAZAPI_WEBHOOK_SECRET ?? "defina-o-segredo";
  const webhookUrl = `${appUrl}/api/webhooks/uazapi?org=${session.organization.id}&secret=${secret}`;

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
      />
    </div>
  );
}
