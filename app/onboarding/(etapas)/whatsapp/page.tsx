import { StepActions, StepHeading } from "@/components/onboarding/step-actions";
import { DesktopOnly } from "@/components/ui/desktop-only";
import { InstanceSettings } from "@/components/whatsapp/instance-settings";
import { getInstanceForOrg, toPublicInstance } from "@/lib/services/whatsapp";
import { getSessionContext } from "@/lib/services/session";
import { buildWebhookUrl } from "@/lib/services/webhook-secret";
import Link from "next/link";

export const metadata = { title: "Configuração inicial — WhatsApp" };

export default async function OnboardingWhatsAppPage() {
  const { organization } = await getSessionContext();
  const instance = await getInstanceForOrg(organization.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  // O layout do assistente já barrou quem não é org_admin/admin global: a URL
  // com o segredo da instância só é montada para quem a pode ver (0010).
  const webhookUrl = instance?.webhook_secret
    ? buildWebhookUrl(appUrl, organization.id, instance.webhook_secret)
    : null;

  return (
    <div className="animate-fade-up space-y-6">
      <StepHeading
        title="Conecte o WhatsApp"
        description="Com o número conectado, toda mensagem recebida vira conversa no Atendimento e lead no funil — e a equipe responde pelo CRM."
      />
      <DesktopOnly description="Conecte o WhatsApp pelo computador. Você pode pular este passo agora e fazer depois em Atendimento → WhatsApp.">
        <InstanceSettings
          organizationId={organization.id}
          instance={toPublicInstance(instance)}
          webhookUrl={webhookUrl}
          canManageWebhook
        />
      </DesktopOnly>
      <p className="text-xs text-ink-faint">
        Usa a API oficial da Meta? Configure em{" "}
        <Link href="/atendimento/configuracoes" className="font-medium text-primary-600 hover:text-primary-700">
          Atendimento → WhatsApp
        </Link>{" "}
        depois de concluir.
      </p>
      <StepActions step="whatsapp" />
    </div>
  );
}
