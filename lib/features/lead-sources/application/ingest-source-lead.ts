/**
 * Caso de uso: transformar uma entrega de fonte de lead em contato +
 * negociação.
 *
 * Não cria regra nova de lead. Traduz os campos para o formulário de destino
 * e segue EXATAMENTE o caminho de `POST /api/ingest/leads`: filtra pelos
 * campos do formulário, confere obrigatórios, reserva o evento
 * (idempotência por formulário + evento) e chama `registerFormLead`, que
 * decide contato, deduplicação e distribuição. Duas portas, uma regra.
 */
import { createHash } from "crypto";
import { registerFormLead } from "@/lib/features/lead-ingestion/application/register-form-lead";
import {
  extractLeadIdentity,
  findMissingRequiredField,
  sanitizeSubmission,
} from "@/lib/features/lead-ingestion/domain/form-payload";
import {
  claimIngestSubmission,
  releaseIngestSubmission,
} from "@/lib/features/lead-ingestion/infrastructure/ingest-queries";
import { buildSubmission } from "@/lib/features/lead-sources/domain/field-mapping";
import type { InboundField } from "@/lib/features/lead-sources/domain/inbound-payload";
import { dealSourceLabel } from "@/lib/features/lead-sources/domain/providers";
import type { ResolvedLeadSource } from "@/lib/features/lead-sources/infrastructure/lead-source-queries";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface SourceLeadOutcome {
  status: "processed" | "duplicate" | "failed";
  /** Motivo em português, para a tela da fonte. */
  error: string | null;
  dealId: string | null;
  deduplicated: boolean;
  /**
   * A falha foi do CRM (banco), não da configuração nem do dado. A rota
   * responde 5xx para a origem reentregar; falha de configuração responde 2xx,
   * porque reentregar não resolve e a entrega fica guardada para reprocessar.
   */
  transient: boolean;
}

/**
 * Chave de idempotência do envio.
 *
 * Com id da origem, é ele. Sem id, é o hash dos campos: a reentrega do mesmo
 * corpo cai como duplicada, e dois leads diferentes nunca colidem. O prefixo
 * da origem impede que o id `1` de um webhook e o de outro se confundam.
 */
export function eventKeyFor(source: ResolvedLeadSource, eventKey: string | null, fields: InboundField[]): string {
  if (eventKey) return `${source.provider}:${eventKey}`;
  const canonical = JSON.stringify(fields.map((f) => [f.key, f.value]));
  return `${source.provider}:sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

const fail = (error: string, transient = false): SourceLeadOutcome => ({
  status: "failed",
  error,
  dealId: null,
  deduplicated: false,
  transient,
});

export async function ingestSourceLead(
  admin: AdminClient,
  source: ResolvedLeadSource,
  fields: InboundField[],
  eventKey: string
): Promise<SourceLeadOutcome> {
  const { form } = source;
  if (fields.length === 0) return fail("A entrega chegou sem nenhum campo preenchido.");
  if (!form.is_active) return fail(`O formulário de destino "${form.name}" está desativado.`);
  if (!form.pipeline_id) return fail(`O formulário de destino "${form.name}" não tem funil configurado.`);

  const { data, metadata } = buildSubmission(fields, source.field_mapping, form.fields);
  const clean = sanitizeSubmission(form.fields, data);
  const missing = findMissingRequiredField(form.fields, clean);
  if (missing) {
    return fail(
      `Faltou o campo obrigatório "${missing.label}". Ligue um dos campos recebidos a ele em "Campos recebidos" e reprocesse.`
    );
  }

  const claim = await claimIngestSubmission(admin, {
    formId: form.id,
    externalEventId: eventKey,
    clean,
    metadata,
  });
  if (claim.status === "duplicate") {
    return { status: "duplicate", error: null, dealId: null, deduplicated: false, transient: false };
  }
  if (claim.status === "error") return fail("O CRM não conseguiu registrar a entrega agora.", true);

  const result = await registerFormLead({
    admin,
    form,
    clean,
    identity: extractLeadIdentity(clean),
    submissionId: claim.submissionId,
    dealSource: dealSourceLabel(source.provider, source.name),
    origin: "external_ingest",
  });

  if (result.error) {
    // Libera a reserva: sem isto a reentrega e o reprocessamento seriam
    // recusados como duplicados e o lead nunca entraria.
    await releaseIngestSubmission(admin, claim.submissionId);
    return fail(result.error, true);
  }

  return {
    status: "processed",
    error: null,
    dealId: result.dealId,
    deduplicated: result.deduplicated,
    transient: false,
  };
}
