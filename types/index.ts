// ============================================================
// Tipos de domínio do Wavemov CRM
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

export interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
  segment: string | null;
  owner_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  created_at: string;
}

export interface QuickReply {
  id: string;
  organization_id: string;
  title: string;
  content: string;
  created_at: string;
}

// Contexto de sessão passado pelo layout autenticado
export interface SessionContext {
  profile: Profile;
  organization: Organization;
  membership: OrganizationMember;
  organizations: Organization[];
}
