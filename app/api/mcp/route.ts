import { executeCrmTool, toolsFor } from "@/lib/features/crm-tools/application/registry";
import { authenticateApiToken } from "@/lib/features/integrations/infrastructure/api-tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// ============================================================
// /api/mcp — servidor MCP (Model Context Protocol), transporte Streamable
// HTTP sem estado, respostas JSON.
//
// Expõe as ferramentas do CRM (as mesmas do agente de IA e da API v1) para
// clientes MCP: Claude Desktop/Code, n8n (nó MCP Client), agentes próprios.
//
// Autenticação: `Authorization: Bearer jid_…` com escopo `mcp` (0029). A
// organização sai do token — nenhuma ferramenta aceita organização no
// argumento.
// ============================================================

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const rpcResult = (id: JsonRpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const rpcError = (id: JsonRpcRequest["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

export async function POST(request: Request) {
  const admin = createAdminClient();
  const auth = await authenticateApiToken(admin, request, "mcp");
  if (!auth) {
    return NextResponse.json(rpcError(null, -32001, "Token ausente, inválido ou sem escopo mcp."), {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }

  const body = (await request.json().catch(() => null)) as JsonRpcRequest | null;
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return NextResponse.json(rpcError(null, -32600, "Requisição JSON-RPC inválida."), { status: 400 });
  }

  // Notificações não têm resposta.
  if (body.id === undefined || body.method.startsWith("notifications/")) {
    return new NextResponse(null, { status: 202 });
  }

  const tools = toolsFor("mcp");

  switch (body.method) {
    case "initialize": {
      const requested = String(body.params?.protocolVersion ?? "");
      return NextResponse.json(
        rpcResult(body.id, {
          protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "crm-jid-midia", version: "1.0.0" },
          instructions:
            "Ferramentas do CRM JID Mídia: contatos, leads, funis, etapas, notas, tarefas, qualificação, base de conhecimento e WhatsApp. Todas operam apenas na empresa do token.",
        })
      );
    }
    case "ping":
      return NextResponse.json(rpcResult(body.id, {}));
    case "tools/list":
      return NextResponse.json(
        rpcResult(body.id, {
          tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters })),
        })
      );
    case "tools/call": {
      const name = String(body.params?.name ?? "");
      const result = await executeCrmTool(
        tools,
        { admin, organizationId: auth.organizationId, actor: "mcp" },
        name,
        body.params?.arguments ?? {}
      );
      return NextResponse.json(
        rpcResult(body.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.ok ? (result.data ?? { ok: true, summary: result.summary }) : { error: result.error }),
            },
          ],
          isError: !result.ok,
        })
      );
    }
    default:
      return NextResponse.json(rpcError(body.id, -32601, `Método não suportado: ${body.method}`));
  }
}

// Sem sessão SSE: o servidor é sem estado.
export async function GET() {
  return NextResponse.json(rpcError(null, -32000, "Use POST (Streamable HTTP, sem SSE)."), {
    status: 405,
    headers: { Allow: "POST" },
  });
}
