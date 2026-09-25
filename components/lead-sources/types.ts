/**
 * Formas de dado que as telas de fontes de lead recebem do servidor — já
 * resolvidas lá, para que regra nenhuma precise entrar no bundle do cliente.
 */
import type { LeadSourceProvider } from "@/lib/features/lead-sources/domain/providers";
import type { SourceStatus } from "@/lib/features/lead-sources/domain/source-status";

export interface LeadSourceSummary {
  id: string;
  name: string;
  provider: LeadSourceProvider;
  status: SourceStatus;
  formName: string;
  pipelineName: string | null;
}

export interface DestinationFormOption {
  id: string;
  name: string;
  pipelineName: string | null;
}

export interface PipelineOption {
  id: string;
  name: string;
  isDefault: boolean;
  /** Só etapas abertas: lead novo nunca nasce ganho ou perdido. */
  stages: { id: string; name: string }[];
}

export interface MemberOption {
  id: string;
  name: string;
}

export interface SourceEventView {
  id: string;
  receivedAt: string;
  status: "processed" | "duplicate" | "failed";
  error: string | null;
  dealId: string | null;
  deduplicated: boolean;
  /** Nome (ou primeiro valor) do lead, para reconhecer a entrega. */
  leadLabel: string | null;
  fields: { key: string; label: string; value: string }[];
}

export interface MappingRowView {
  key: string;
  label: string;
  value: string;
  target: string | null;
  explicit: boolean;
}

export interface TargetOption {
  fieldKey: string;
  label: string;
}
