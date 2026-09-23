// ============================================================
// Tipos de domínio do CRM JID Mídia
// Espelham as tabelas do Supabase (supabase/migrations)
// ============================================================

export type Role = "org_admin" | "seller" | "agent" | "viewer";
export type DealStatus = "open" | "won" | "lost" | "archived";
export type Temperature = "cold" | "warm" | "hot";
export type AiStatus = "none" | "qualifying" | "qualified" | "handoff";
export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "pending" | "done";
export type ConversationStatus = "open" | "pending" | "resolved" | "archived";
export type InstanceStatus = "disconnected" | "connecting" | "qr" | "connected" | "error";
export type MessageDirection = "inbound" | "outbound";
export type MessageType = "text" | "image" | "audio" | "video" | "document" | "system";
/** Quem escreveu a mensagem (migration 0027). */
export type MessageSenderType = "contact" | "user" | "ai" | "automation" | "system";
export type MessageDeliveryStatus = "pending" | "sent" | "delivered" | "read" | "failed";
/** Quem conduz a conversa agora: o agente de IA ou a equipe (migration 0027). */
export type HandlingMode = "ai" | "human";
export type ChannelProvider = "uazapi" | "meta_cloud";
export type DealTagTone =
  | "blue"
  | "green"
  | "red"
  | "amber"
  | "slate"
  | "violet"
  | "cyan"
  | "orange";

export interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
  segment: string | null;
  owner_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /**
   * 0030. Opcionais porque o código sobe antes da migration: sem a coluna o
   * `select *` simplesmente não os traz, e `undefined` vale como "já
   * configurada" — ninguém fica preso no assistente por falta de migration.
   */
  onboarded_at?: string | null;
  onboarding_steps?: Record<string, "done" | "skipped"> | null;
}

export interface Profile {
  id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
  is_global_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  profile_id: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  profile?: Profile;
  organization?: Organization;
}

export interface Pipeline {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  /** Funil que recebe leads sem escolha explícita (migration 0012). */
  is_default: boolean;
  created_at: string;
  stages?: PipelineStage[];
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  order_index: number;
  color: string;
  is_won_stage: boolean;
  is_lost_stage: boolean;
  /** Etapa em que a IA nunca responde (migration 0027). */
  requires_human?: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  organization_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  avatar_url: string | null;
  document: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LostReason {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
}

export interface Deal {
  id: string;
  organization_id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string | null;
  company_id: string | null;
  responsible_id: string | null;
  title: string;
  value: number;
  status: DealStatus;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  temperature: Temperature;
  ai_status: AiStatus;
  /** Dados extraídos pelo agente de IA (migration 0027). */
  ai_qualification?: Record<string, unknown>;
  expected_close_date: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_reason_id: string | null;
  created_at: string;
  updated_at: string;
  contact?: Contact | null;
  responsible?: Profile | null;
  stage?: PipelineStage | null;
  pipeline?: Pipeline | null;
  lost_reason?: LostReason | null;
  tag_assignments?: DealTagAssignment[];
}

/** Catálogo e vínculo de tags de negociação (migration 0019). */
export interface DealTag {
  id: string;
  organization_id: string;
  name: string;
  category: string | null;
  tone: DealTagTone;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealTagAssignment {
  deal_id: string;
  tag_id: string;
  organization_id: string;
  assigned_by: string | null;
  assigned_at: string;
  tag?: DealTag | null;
}

export interface DealStageHistory {
  id: string;
  deal_id: string;
  from_stage_id: string | null;
  to_stage_id: string | null;
  changed_by: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  organization_id: string;
  deal_id: string | null;
  contact_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deal?: Deal | null;
  contact?: Contact | null;
  assignee?: Profile | null;
}

export interface ActivityLog {
  id: string;
  organization_id: string;
  actor_id: string | null;
  deal_id: string | null;
  contact_id: string | null;
  type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: Profile | null;
}

export interface Form {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  default_responsible_id: string | null;
  is_active: boolean;
  created_at: string;
  /**
   * Apelido colado no fluxo do n8n para receber leads por
   * `POST /api/ingest/leads` (migration 0014). Globalmente único; nulo nos
   * formulários que só existem na página pública `/f/[slug]`.
   */
  external_id: string | null;
  fields?: FormField[];
  pipeline?: Pipeline | null;
  stage?: PipelineStage | null;
}

export interface FormField {
  id: string;
  form_id: string;
  label: string;
  field_key: string;
  field_type: "text" | "email" | "phone" | "number" | "textarea" | "select";
  is_required: boolean;
  options: string[];
  order_index: number;
}

export interface FormSubmission {
  id: string;
  form_id: string;
  contact_id: string | null;
  deal_id: string | null;
  raw_data: Record<string, unknown>;
  created_at: string;
}

export interface WhatsAppInstance {
  id: string;
  organization_id: string;
  name: string;
  provider: string;
  base_url: string | null;
  instance_id: string | null;
  token_encrypted: string | null;
  // Segredo do webhook desta instância (migration 0010). Server-only:
  // `toPublicInstance()` remove antes de qualquer prop de cliente.
  webhook_secret: string;
  // API oficial da Meta (migration 0027).
  phone_number_id?: string | null;
  business_account_id?: string | null;
  display_phone?: string | null;
  status: InstanceStatus;
  qr_code: string | null;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppConversation {
  id: string;
  organization_id: string;
  instance_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  assigned_to: string | null;
  phone: string;
  name: string | null;
  status: ConversationStatus;
  unread_count: number;
  last_message: string | null;
  last_message_at: string | null;
  // Atendimento por IA e follow-up (migration 0027).
  handling_mode?: HandlingMode;
  ai_agent_id?: string | null;
  handoff_reason?: string | null;
  handoff_at?: string | null;
  last_message_direction?: MessageDirection | null;
  last_inbound_at?: string | null;
  followup_count?: number;
  last_followup_at?: string | null;
  created_at: string;
  updated_at: string;
  contact?: Contact | null;
  assignee?: Profile | null;
  deal?: Deal | null;
}

export interface WhatsAppMessage {
  id: string;
  organization_id: string;
  conversation_id: string;
  provider_message_id: string | null;
  direction: MessageDirection;
  message_type: MessageType;
  content: string | null;
  media_url: string | null;
  sender_phone: string | null;
  receiver_phone: string | null;
  raw_payload: Record<string, unknown>;
  sent_by: string | null;
  sender_type?: MessageSenderType;
  delivery_status?: MessageDeliveryStatus | null;
  created_at: string;
}

/** Payload mínimo usado para desenhar uma conversa sem serializar raw_payload. */
export type ConversationThreadMessage = Pick<
  WhatsAppMessage,
  | "id"
  | "organization_id"
  | "conversation_id"
  | "direction"
  | "message_type"
  | "content"
  | "media_url"
  | "sender_phone"
  | "receiver_phone"
  | "sent_by"
  | "created_at"
> &
  Partial<Pick<WhatsAppMessage, "sender_type" | "delivery_status">>;

export interface QuickReply {
  id: string;
  organization_id: string;
  title: string;
  content: string;
  created_at: string;
}

// ------------------------------------------------------------
// Views agregadas (supabase/migrations/0009_reporting.sql)
// ------------------------------------------------------------

export interface OrgDealStats {
  organization_id: string;
  deals_total: number;
  deals_open: number;
  deals_won: number;
  deals_lost: number;
  value_won: number;
  value_open: number;
  last_deal_at: string | null;
  last_activity_at: string | null;
}

export interface PipelineStageStats {
  stage_id: string;
  pipeline_id: string;
  organization_id: string;
  deals_total: number;
  deals_open: number;
  value_open: number;
}

export interface DealTagTotal {
  tag_id: string;
  name: string;
  category: string | null;
  tone: DealTagTone;
  is_active: boolean;
  deals_total: number;
  deals_open: number;
  deals_won: number;
  deals_lost: number;
  value_won: number;
}

export interface DealTagEvolutionPoint {
  tag_id: string;
  name: string;
  bucket_start: string;
  deals_total: number;
}

export interface DealTagResponsibleTotal {
  tag_id: string;
  name: string;
  tone: DealTagTone;
  responsible_id: string | null;
  responsible_name: string | null;
  deals_total: number;
}

/** Linha do relatório de entrada de leads — só o que a tabela exibe. */
export interface LeadRow {
  id: string;
  title: string;
  created_at: string;
  source: string | null;
  contactName: string | null;
  whatsapp: string | null;
  formName: string | null;
  pipelineName: string | null;
  stageName: string | null;
  stageColor: string | null;
  responsibleName: string;
}

// Contexto de sessão passado pelo layout autenticado
export interface SessionContext {
  profile: Profile;
  organization: Organization;
  membership: OrganizationMember;
  organizations: Organization[];
}

// ============================================================
// IA, automações e integrações (migrations 0026–0029)
// ============================================================

export interface QualificationField {
  key: string;
  label: string;
  description?: string;
}

export interface AiAgent {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  model: string;
  temperature: number;
  system_prompt: string;
  enabled_tools: string[];
  use_knowledge_base: boolean;
  auto_reply_new_conversations: boolean;
  reply_delay_seconds: number;
  handoff_on_request: boolean;
  handoff_on_legal: boolean;
  handoff_on_uncertainty: boolean;
  handoff_message: string | null;
  qualification_fields: QualificationField[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type KnowledgeDocumentStatus = "pending" | "indexing" | "ready" | "error";

export interface KnowledgeDocument {
  id: string;
  organization_id: string;
  agent_id: string | null;
  title: string;
  source_type: "text" | "faq" | "url";
  source_url: string | null;
  content: string;
  status: KnowledgeDocumentStatus;
  error: string | null;
  chunk_count: number;
  indexed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiRun {
  id: string;
  organization_id: string;
  agent_id: string | null;
  conversation_id: string | null;
  deal_id: string | null;
  trigger: "inbound" | "manual" | "automation" | "test";
  status: "success" | "handoff" | "skipped" | "error";
  input_text: string | null;
  output_text: string | null;
  tool_calls: { name: string; ok: boolean; summary?: string }[];
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
}

export type AutomationTrigger =
  | "deal.created"
  | "deal.stage_changed"
  | "deal.won"
  | "deal.lost"
  | "deal.assigned"
  | "message.received"
  | "conversation.no_reply";

export interface AutomationCondition {
  field: string;
  op: "eq" | "neq" | "contains";
  value: string;
}

export interface AutomationAction {
  type: string;
  config: Record<string, unknown>;
}

export interface AutomationRule {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_event: AutomationTrigger;
  trigger_config: Record<string, unknown>;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  run_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationRun {
  id: string;
  organization_id: string;
  rule_id: string;
  event_id: string | null;
  deal_id: string | null;
  conversation_id: string | null;
  dedupe_key: string;
  status: "success" | "partial" | "failed" | "skipped";
  results: { type: string; status: string; error?: string }[];
  error: string | null;
  created_at: string;
}

export interface ApiToken {
  id: string;
  organization_id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}
