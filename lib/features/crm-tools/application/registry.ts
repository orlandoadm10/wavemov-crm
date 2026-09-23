// ============================================================
// Catálogo das ferramentas do CRM e execução com validação.
// ============================================================
import type { ChatToolDefinition } from "@/lib/features/ai-agent/infrastructure/llm-client";
export { AI_TOOL_LABELS } from "../domain/tool-labels";
import { DIRECTORY_TOOLS } from "./directory-tools";
import { LEAD_TOOLS } from "./lead-tools";
import type { CrmTool, CrmToolActor, CrmToolContext, CrmToolResult } from "./tool-types";

export const ALL_CRM_TOOLS: CrmTool[] = [...LEAD_TOOLS, ...DIRECTORY_TOOLS];

export function toolsFor(actor: CrmToolActor, enabled?: string[]): CrmTool[] {
  return ALL_CRM_TOOLS.filter(
    (tool) => tool.actors.includes(actor) && (!enabled || enabled.includes(tool.name))
  );
}

export function toChatTools(tools: CrmTool[]): ChatToolDefinition[] {
  return tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

export async function executeCrmTool(
  tools: CrmTool[],
  ctx: CrmToolContext,
  name: string,
  rawArgs: unknown
): Promise<CrmToolResult> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `Ferramenta indisponível: ${name}`, summary: `Recusada: ${name}` };

  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("; ");
    return { ok: false, error: `Argumentos inválidos — ${detail}`, summary: `${name}: argumentos inválidos` };
  }
  try {
    return await tool.execute(ctx, parsed.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[crm-tools] ${name} falhou`, { organizationId: ctx.organizationId, message });
    return { ok: false, error: "Falha interna ao executar a ferramenta.", summary: `${name}: erro` };
  }
}
