// ============================================================
// Contrato das ferramentas do CRM — usadas pelo agente de IA (tool calling),
// pelo servidor MCP e pela API v1. Uma implementação por ferramenta, três
// portas de entrada: a regra de "mover etapa" não pode existir em três cópias.
//
// SEGURANÇA
// Toda ferramenta roda com service_role e recebe `organizationId` de fonte
// confiável (conversa autenticada pelo webhook, token de API). Nenhum id do
// argumento é aceito sem conferir a organização. Quando o contexto já fixa um
// lead (turno da IA numa conversa), o id do contexto VENCE o do argumento: o
// modelo não pode ser convencido por um lead a mexer no cadastro de outro.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

export type CrmToolActor = "ai" | "api" | "mcp";

export interface CrmToolContext {
  admin: SupabaseClient;
  organizationId: string;
  actor: CrmToolActor;
  /** Fixados pelo turno da IA; opcionais para MCP/API. */
  conversationId?: string | null;
  dealId?: string | null;
  contactId?: string | null;
  agentId?: string | null;
}

export interface CrmToolResult {
  ok: boolean;
  /** Devolvido ao modelo/cliente MCP como JSON. */
  data?: unknown;
  error?: string;
  /** Uma linha legível para a trilha (ai_runs.tool_calls). */
  summary: string;
  /** O registro pedido não existe NESTA empresa (API responde 404). */
  notFound?: boolean;
  /** Sinal para o turno da IA encerrar e passar para humano. */
  handoff?: { reason: string };
}

export interface CrmTool<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  /** JSON Schema dos argumentos (tool calling / MCP). */
  parameters: Record<string, unknown>;
  schema: TSchema;
  /** Portas em que a ferramenta está disponível. */
  actors: CrmToolActor[];
  execute(ctx: CrmToolContext, args: z.infer<TSchema>): Promise<CrmToolResult>;
}

export function defineTool<TSchema extends z.ZodTypeAny>(tool: CrmTool<TSchema>): CrmTool {
  return tool as unknown as CrmTool;
}

export function toolError(summary: string, error = summary): CrmToolResult {
  return { ok: false, error, summary };
}
