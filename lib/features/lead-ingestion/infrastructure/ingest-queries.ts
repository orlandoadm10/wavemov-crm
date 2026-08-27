/**
 * Acesso ao banco da ingestão externa (migration 0014) — USO EXCLUSIVO NO
 * SERVIDOR, sempre com `service_role`.
 *
 * Três responsabilidades, nesta ordem porque é a ordem em que a rota as usa:
 * provar de quem é a chamada, achar o formulário-alvo e reservar o evento.
 */
import { secretsMatch } from "@/lib/services/webhook-secret";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Violação de unicidade no Postgres. */
const UNIQUE_VIOLATION = "23505";

/**
 * Organização dona do segredo apresentado, ou `null`.
 *
 * O lookup usa o índice único de `organization_ingest_secrets.secret`: um
 * segredo jamais resolve duas empresas. A reconferência em tempo constante
 * repete o padrão do webhook da UAZAPI — ela existe para que nenhuma mudança
 * futura no filtro (`ilike`, coluna sem unique, comparação relaxada)
 * transforme um "quase igual" em autenticação válida.
 */
export async function findOrganizationByIngestSecret(
  admin: AdminClient,
  presentedSecret: string
): Promise<string | null> {
  const { data, error } = await admin
    .from("organization_ingest_secrets")
    .select("organization_id, secret")
    .eq("secret", presentedSecret)
    .maybeSingle();

  // Sem a 0014 aplicada a tabela não existe e tudo é recusado com 401. É o
  // comportamento certo — recusar em vez de adivinhar — mas o motivo precisa
  // aparecer no log, senão vira "parou de chegar lead" sem explicação.
  if (error) {
    console.error(
      "[ingest] falha ao consultar organization_ingest_secrets — a migration 0014 foi aplicada?",
      error
    );
    return null;
  }

  if (!data || !secretsMatch(presentedSecret, data.secret)) return null;
  return data.organization_id as string;
}

/**
 * Segredo de ingestão de UMA organização, para a tela de formulários.
 *
 * Só existe caminho de leitura pelo `service_role`: a 0014 revoga a tabela de
 * `anon` e `authenticated` e liga o RLS sem policy nenhuma. O CHAMADOR é
 * obrigado a checar o papel antes — esta função não sabe quem está pedindo, e
 * um segredo renderizado para um `viewer` é o defeito que a 0010 existiu para
 * fechar.
 *
 * `null` significa "esta empresa ainda não tem credencial", não erro: a
 * migration não cria linha para organização nascida depois dela.
 */
export async function findIngestSecretForOrganization(
  admin: AdminClient,
  organizationId: string
): Promise<{ secret: string; rotated_at: string | null } | null> {
  const { data, error } = await admin
    .from("organization_ingest_secrets")
    .select("secret, rotated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ingest] falha ao ler a credencial da organização", error);
    return null;
  }
  return data ?? null;
}

export interface IngestTargetForm {
  id: string;
  organization_id: string;
  name: string;
  pipeline_id: string | null;
  stage_id: string | null;
  default_responsible_id: string | null;
  fields: { label: string; field_key: string; is_required: boolean }[];
}

/**
 * Formulário ATIVO com este `external_id`, em qualquer organização.
 *
 * A busca é deliberadamente global, e o chamador é obrigado a conferir a
 * organização depois: é o único ponto do fluxo em que um erro reabriria o
 * vazamento entre empresas. Filtrar por organização aqui dentro pareceria
 * mais seguro e seria pior — um `external_id` de outra empresa devolveria
 * "não encontrado", que é a mesma resposta de um id inexistente, e ninguém
 * jamais descobriria uma credencial mal configurada apontando para a base
 * errada.
 */
export async function findFormByExternalId(
  admin: AdminClient,
  externalId: string
): Promise<IngestTargetForm | null> {
  const { data, error } = await admin
    .from("forms")
    .select(
      "id, organization_id, name, pipeline_id, stage_id, default_responsible_id, fields:form_fields(label, field_key, is_required)"
    )
    .eq("external_id", externalId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[ingest] falha ao consultar formulário por external_id", error);
    return null;
  }
  if (!data) return null;

  return { ...data, fields: data.fields ?? [] } as IngestTargetForm;
}

export type SubmissionClaim =
  | { status: "claimed"; submissionId: string }
  | { status: "duplicate" }
  | { status: "error" };

/**
 * Reserva o evento gravando a submissão ANTES de criar contato e negociação.
 *
 * A submissão é a própria trava: o único parcial `(form_id,
 * external_event_id)` da 0014 recusa a segunda tentativa. Reservar primeiro,
 * e não no fim, é o que fecha a janela em que duas entregas simultâneas do
 * mesmo evento — o caso comum de retentativa de webhook — criariam dois
 * leads iguais antes de qualquer uma delas gravar a marca.
 */
export async function claimIngestSubmission(
  admin: AdminClient,
  input: { formId: string; externalEventId: string; clean: Record<string, string> }
): Promise<SubmissionClaim> {
  const { data, error } = await admin
    .from("form_submissions")
    .insert({
      form_id: input.formId,
      external_event_id: input.externalEventId,
      source: "external_ingest",
      raw_data: input.clean,
    })
    .select("id")
    .single();

  if (error?.code === UNIQUE_VIOLATION) return { status: "duplicate" };
  if (error || !data) {
    console.error("[ingest] falha ao reservar submissão", error);
    return { status: "error" };
  }
  return { status: "claimed", submissionId: data.id };
}

/**
 * Devolve o evento para a fila apagando a reserva.
 *
 * Sem isto, uma falha ao criar o contato deixaria o evento marcado como já
 * processado: a retentativa do n8n receberia "duplicado", e o lead nunca
 * entraria. Idempotência que engole lead é pior que lead repetido.
 */
export async function releaseIngestSubmission(admin: AdminClient, submissionId: string) {
  const { error } = await admin.from("form_submissions").delete().eq("id", submissionId);
  if (error) {
    console.error(
      "[ingest] falha ao liberar a reserva do evento — a retentativa deste evento será recusada como duplicada",
      error
    );
  }
}
