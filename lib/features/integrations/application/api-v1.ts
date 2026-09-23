// ============================================================
// API v1 (n8n, sistemas externos): autentica o token, resolve a organização
// DELE e executa a ferramenta do CRM correspondente. As rotas REST são só
// apelidos legíveis para as mesmas ferramentas do MCP e da IA.
//
// Resposta: { data } em sucesso; { error, details? } em falha.
// ============================================================
import { NextResponse } from "next/server";
import { executeCrmTool, toolsFor } from "@/lib/features/crm-tools/application/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateApiToken } from "../infrastructure/api-tokens";

export async function runApiTool(request: Request, toolName: string, args: unknown) {
  const admin = createAdminClient();
  const auth = await authenticateApiToken(admin, request, "api");
  if (!auth) {
    return NextResponse.json(
      { error: "Token de API ausente, inválido ou revogado. Use Authorization: Bearer jid_…" },
      { status: 401 }
    );
  }

  const tools = toolsFor("api");
  if (!tools.some((t) => t.name === toolName)) {
    return NextResponse.json({ error: `Operação desconhecida: ${toolName}` }, { status: 404 });
  }

  const result = await executeCrmTool(tools, { admin, organizationId: auth.organizationId, actor: "api" }, toolName, args);
  if (!result.ok) {
    const invalid = result.error?.startsWith("Argumentos inválidos");
    const status = result.notFound ? 404 : invalid ? 400 : 422;
    return NextResponse.json({ error: result.error ?? result.summary }, { status });
  }
  return NextResponse.json({ data: result.data ?? null, summary: result.summary });
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}
