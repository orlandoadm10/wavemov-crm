/**
 * Acesso ao banco das fontes de lead (migration 0032) — USO EXCLUSIVO NO
 * SERVIDOR, sempre com `service_role`.
 *
 * A rota pública não tem sessão: a ORGANIZAÇÃO sai do token da URL, e o
 * formulário de destino sai da fonte que o token resolveu. Nada do corpo da
 * requisição escolhe empresa, formulário, funil ou etapa.
 */
import type { InboundField } from "@/lib/features/lead-sources/domain/inbound-payload";
import type { FieldMapping } from "@/lib/features/lead-sources/domain/field-mapping";
import type { LeadSourceProvider } from "@/lib/features/lead-sources/domain/providers";
import { secretsMatch } from "@/lib/services/webhook-secret";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Eventos mais antigos que isto são apagados: contêm dado pessoal do lead. */
const EVENT_RETENTION_DAYS = 30;

export interface ResolvedLeadSource {
  id: string;
  organization_id: string;
  name: string;
  provider: LeadSourceProvider;
  is_active: boolean;
  field_mapping: FieldMapping;
  form: {
    id: string;
    organization_id: string;
    name: string;
    is_active: boolean;
    pipeline_id: string | null;
    stage_id: string | null;
    default_responsible_id: string | null;
    fields: { label: string; field_key: string; field_type: string; is_required: boolean }[];
  };
}

const SOURCE_SELECT =
  "id, organization_id, name, provider, is_active, field_mapping, form:forms!lead_sources_form_same_org_fkey(id, organization_id, name, is_active, pipeline_id, stage_id, default_responsible_id, fields:form_fields(label, field_key, field_type, is_required))";

function toResolvedSource(row: Record<string, unknown> | null): ResolvedLeadSource | null {
  if (!row) return null;
  const form = Array.isArray(row.form) ? row.form[0] : row.form;
  if (!form) return null;
  const source = { ...row, form: { ...form, fields: form.fields ?? [] } } as unknown as ResolvedLeadSource;
  // Defesa em profundidade: a FK composta da 0032 já impede, mas é a linha
  // que separaria duas empresas se alguém a removesse.
  if (source.form.organization_id !== source.organization_id) return null;
  return source;
}

/**
 * Fonte dona do token da URL, ou `null`.
 *
 * Token inexistente e fonte pausada devolvem o mesmo `null`: a rota responde
 * igual para os dois, e a URL não vira um verificador de tokens. A
 * reconferência em tempo constante segue o padrão da 0014.
 */
export async function findSourceByToken(admin: AdminClient, token: string): Promise<ResolvedLeadSource | null> {
  const { data: secret, error } = await admin
    .from("lead_source_secrets")
    .select("lead_source_id, organization_id, token")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error("[lead-sources] falha ao consultar o token — a migration 0032 foi aplicada?", error);
    return null;
  }
  if (!secret || !secretsMatch(token, secret.token)) return null;

  const { data, error: sourceError } = await admin
    .from("lead_sources")
    .select(SOURCE_SELECT)
    .eq("id", secret.lead_source_id)
    .eq("organization_id", secret.organization_id)
    .eq("is_active", true)
    .maybeSingle();

  if (sourceError) {
    console.error("[lead-sources] falha ao carregar a fonte", sourceError);
    return null;
  }
  return toResolvedSource(data as Record<string, unknown> | null);
}

/** Fonte de UMA organização, para reprocessar pela tela. */
export async function findSourceForOrganization(
  admin: AdminClient,
  sourceId: string,
  organizationId: string
): Promise<ResolvedLeadSource | null> {
  const { data, error } = await admin
    .from("lead_sources")
    .select(SOURCE_SELECT)
    .eq("id", sourceId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    console.error("[lead-sources] falha ao carregar a fonte", error);
    return null;
  }
  return toResolvedSource(data as Record<string, unknown> | null);
}

/**
 * Tokens das fontes de UMA organização, para a tela montar as URLs.
 *
 * O CHAMADOR é obrigado a checar o papel antes: esta função não sabe quem
 * está pedindo, e a URL cria lead nesta empresa.
 */
export async function findSourceTokens(
  admin: AdminClient,
  organizationId: string
): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from("lead_source_secrets")
    .select("lead_source_id, token")
    .eq("organization_id", organizationId);
  if (error) {
    console.error("[lead-sources] falha ao ler os tokens da organização", error);
    return new Map();
  }
  return new Map((data ?? []).map((row) => [row.lead_source_id as string, row.token as string]));
}

export interface SourceEventRecord {
  status: "processed" | "duplicate" | "failed";
  eventKey: string | null;
  fields: InboundField[];
  error: string | null;
  dealId: string | null;
  deduplicated: boolean;
}

/**
 * Registra uma entrega e marca a fonte como viva.
 *
 * Falhar aqui não derruba a entrega: o lead já foi (ou não) criado, e é isso
 * que a origem precisa saber. Fica no log.
 */
export async function recordSourceEvent(admin: AdminClient, source: ResolvedLeadSource, event: SourceEventRecord) {
  const now = new Date();
  const [{ error }, { error: touchError }] = await Promise.all([
    admin.from("lead_source_events").insert({
      organization_id: source.organization_id,
      lead_source_id: source.id,
      status: event.status,
      event_key: event.eventKey,
      fields: event.fields,
      error: event.error,
      deal_id: event.dealId,
      deduplicated: event.deduplicated,
    }),
    admin
      .from("lead_sources")
      .update({ last_event_at: now.toISOString() })
      .eq("id", source.id)
      .eq("organization_id", source.organization_id),
  ]);
  if (error) console.error("[lead-sources] falha ao registrar a entrega", error);
  if (touchError) console.error("[lead-sources] falha ao atualizar a última entrega", touchError);

  const cutoff = new Date(now.getTime() - EVENT_RETENTION_DAYS * 86_400_000).toISOString();
  const { error: purgeError } = await admin
    .from("lead_source_events")
    .delete()
    .eq("lead_source_id", source.id)
    .lt("received_at", cutoff);
  if (purgeError) console.error("[lead-sources] falha ao apagar entregas antigas", purgeError);
}

/** Resultado do reprocessamento, sobre a MESMA linha do evento. */
export async function updateSourceEvent(
  admin: AdminClient,
  eventId: string,
  organizationId: string,
  event: Pick<SourceEventRecord, "status" | "error" | "dealId" | "deduplicated">
): Promise<boolean> {
  const { data, error } = await admin
    .from("lead_source_events")
    .update({ status: event.status, error: event.error, deal_id: event.dealId, deduplicated: event.deduplicated })
    .eq("id", eventId)
    .eq("organization_id", organizationId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[lead-sources] falha ao atualizar a entrega reprocessada", error);
    return false;
  }
  return true;
}
