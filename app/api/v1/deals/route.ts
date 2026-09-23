import { readJson, runApiTool } from "@/lib/features/integrations/application/api-v1";

// GET /api/v1/deals?status=open&stage_id=…&pipeline_id=…&q=…&limit=50
export async function GET(request: Request) {
  const url = new URL(request.url);
  const args: Record<string, unknown> = {};
  for (const key of ["pipeline_id", "stage_id", "status"] as const) {
    const value = url.searchParams.get(key);
    if (value) args[key] = value;
  }
  const q = url.searchParams.get("q");
  if (q) args.query = q;
  const limit = url.searchParams.get("limit");
  if (limit) args.limit = Number(limit);
  return runApiTool(request, "list_deals", args);
}

// POST /api/v1/deals — cria o lead (contato + negociação no funil padrão,
// com distribuição automática). Body: { name, phone?, email?, title?, value?, source?, notes? }
export async function POST(request: Request) {
  return runApiTool(request, "create_lead", await readJson(request));
}
