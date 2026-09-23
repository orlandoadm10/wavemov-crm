import { readJson, runApiTool } from "@/lib/features/integrations/application/api-v1";

// POST /api/v1/tools/:name — executa qualquer ferramenta do CRM disponível
// para a API (a mesma lista do MCP) com o corpo JSON como argumentos.
// Útil no n8n para operações sem rota REST dedicada (add_note, create_task…).
export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return runApiTool(request, name, (await readJson(request)) ?? {});
}
