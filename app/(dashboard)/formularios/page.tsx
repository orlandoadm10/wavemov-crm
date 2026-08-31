import { ExternalIngestPanel } from "@/components/forms/external-ingest-panel";
import { FormsClient } from "@/components/forms/forms-client";
import { PageHeader } from "@/components/layout/page-header";
import { findIngestSecretForOrganization } from "@/lib/features/lead-ingestion/infrastructure/ingest-queries";
import { getFormsHealth } from "@/lib/features/lead-ingestion/infrastructure/ingestion-health-query";
import { formatSilence } from "@/lib/features/lead-ingestion/domain/ingestion-health";
import { getSessionContext } from "@/lib/services/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Form, Pipeline, Profile } from "@/types";

export const metadata = { title: "Formulários" };
export const dynamic = "force-dynamic";

export default async function FormulariosPage() {
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const [{ data: formsRaw }, { data: pipelinesRaw }, { data: membersRaw }] = await Promise.all([
    supabase
      .from("forms")
      .select("*, fields:form_fields(*)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("pipelines")
      .select("*, stages:pipeline_stages(*)")
      .eq("organization_id", orgId)
      .order("created_at"),
    supabase
      .from("organization_members")
      .select("profile:profiles(*)")
      .eq("organization_id", orgId)
      .eq("is_active", true),
  ]);

  // Guarda de papel: a credencial de ingestão autentica quem escreve nesta
  // organização inteira. Quem a tem cria lead em qualquer formulário da
  // empresa — por isso ela é lida SÓ para administradores, e a leitura nem
  // acontece para os demais: sem esta condição o segredo entraria no payload
  // do Server Component mesmo que a tela não o desenhasse.
  // Uma linha de saúde por fluxo do n8n. Só para quem administra a ingestão —
  // é a mesma guarda do painel, e o painel inteiro já é de `org_admin`.
  const formsHealth =
    session.membership.role === "org_admin" || session.profile.is_global_admin
      ? await getFormsHealth(supabase, orgId)
      : [];

  const canManageIngest =
    session.membership.role === "org_admin" || session.profile.is_global_admin;

  const ingestSecret = canManageIngest
    ? (await findIngestSecretForOrganization(createAdminClient(), orgId))?.secret ?? null
    : null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const forms = (formsRaw ?? []) as Form[];

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        title="Criador de formulários"
        subtitle={`Formulários de captura de leads · ${forms.length} criado(s)`}
      />
      <FormsClient
        organizationId={orgId}
        forms={forms}
        pipelines={(pipelinesRaw ?? []) as Pipeline[]}
        members={((membersRaw ?? []) as unknown as { profile: Profile }[]).map((m) => m.profile)}
      />
      {canManageIngest && (
        <ExternalIngestPanel
          endpoint={`${appUrl.replace(/\/$/, "")}/api/ingest/leads`}
          secret={ingestSecret}
          connectedForms={forms
            .filter((f) => f.external_id)
            .map((f) => {
              const saude = formsHealth.find((h) => h.formId === f.id)?.health;
              return {
                id: f.id,
                name: f.name,
                externalId: f.external_id as string,
                isActive: f.is_active,
                health: {
                  tone: saude?.tone ?? "slate",
                  // Curto porque divide a linha com o nome e o
                  // identificador do formulário.
                  label:
                    saude && saude.hoursSince !== null
                      ? formatSilence(saude.hoursSince)
                      : saude?.status === "never_received"
                        ? "Aguardando"
                        : saude?.status === "unknown"
                          ? "Sem apuração"
                          : "—",
                },
              };
            })}
        />
      )}
    </div>
  );
}
