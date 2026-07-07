import { z } from "zod";

// ---------------- Auth ----------------
export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Mínimo de 6 caracteres"),
});

export const registerSchema = z.object({
  first_name: z.string().min(2, "Informe seu nome"),
  last_name: z.string().min(1, "Informe seu sobrenome"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Mínimo de 8 caracteres"),
  organization_name: z.string().min(2, "Informe o nome da empresa"),
});

// ---------------- Organização ----------------
export const organizationSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  segment: z.string().optional().nullable(),
  owner_name: z.string().optional().nullable(),
  logo_url: z.string().url("URL inválida").optional().or(z.literal("")).nullable(),
  is_active: z.boolean().optional(),
});

// ---------------- Perfil / Pessoa ----------------
export const profileSchema = z.object({
  first_name: z.string().min(1, "Nome obrigatório"),
  last_name: z.string().optional().default(""),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional().nullable(),
  job_title: z.string().optional().nullable(),
  avatar_url: z.string().url("URL inválida").optional().or(z.literal("")).nullable(),
});

export const memberSchema = z.object({
  first_name: z.string().min(1, "Nome obrigatório"),
  last_name: z.string().optional().default(""),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional().nullable(),
  job_title: z.string().optional().nullable(),
  role: z.enum(["org_admin", "seller", "agent", "viewer"]),
});

// ---------------- Contato ----------------
export const contactSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  whatsapp_phone: z.string().optional().nullable(),
  document: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// ---------------- Negociação ----------------
export const dealSchema = z.object({
  title: z.string().min(2, "Título obrigatório"),
  value: z.coerce.number().min(0).default(0),
  pipeline_id: z.string().uuid("Selecione um funil"),
  stage_id: z.string().uuid("Selecione uma etapa"),
  contact_id: z.string().uuid().optional().or(z.literal("")).nullable(),
  responsible_id: z.string().uuid().optional().or(z.literal("")).nullable(),
  source: z.string().optional().nullable(),
  temperature: z.enum(["cold", "warm", "hot"]).default("cold"),
  expected_close_date: z.string().optional().nullable(),
  utm_source: z.string().optional().nullable(),
  utm_medium: z.string().optional().nullable(),
  utm_campaign: z.string().optional().nullable(),
});

// ---------------- Tarefa ----------------
export const taskSchema = z.object({
  title: z.string().min(2, "Título obrigatório"),
  description: z.string().optional().nullable(),
  due_at: z.string().optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  deal_id: z.string().uuid().optional().or(z.literal("")).nullable(),
  contact_id: z.string().uuid().optional().or(z.literal("")).nullable(),
  assigned_to: z.string().uuid().optional().or(z.literal("")).nullable(),
});

// ---------------- Formulário ----------------
export const formSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  description: z.string().optional().nullable(),
  pipeline_id: z.string().uuid("Selecione um funil"),
  stage_id: z.string().uuid("Selecione uma etapa"),
  default_responsible_id: z.string().uuid().optional().or(z.literal("")).nullable(),
});

export const formFieldSchema = z.object({
  label: z.string().min(1, "Rótulo obrigatório"),
  field_key: z.string().min(1),
  field_type: z.enum(["text", "email", "phone", "number", "textarea", "select"]),
  is_required: z.boolean().default(false),
  options: z.array(z.string()).default([]),
});

// Submissão pública de formulário (validada no servidor)
export const publicSubmissionSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]).transform((v) => String(v))
);

// ---------------- WhatsApp ----------------
// Não existe um "Instance ID" para configurar na UAZAPI — o token já
// identifica a instância unicamente. Quando a API retorna um id (apenas
// informativo), ele é salvo automaticamente após o teste de conexão.
export const whatsappInstanceSchema = z.object({
  name: z.string().min(1).default("Principal"),
  base_url: z.string().url("URL inválida"),
  token: z.string().min(1, "Token obrigatório"),
});

export const sendMessageSchema = z.object({
  conversation_id: z.string().uuid(),
  content: z.string().min(1, "Mensagem vazia").max(4096),
});

// Payload normalizado do webhook UAZAPI (defensivo — a API pode variar)
export const uazapiWebhookSchema = z.object({
  event: z.string().optional(),
  instance: z.string().optional(),
  data: z.unknown(),
}).passthrough();
