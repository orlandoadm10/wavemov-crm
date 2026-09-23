import { runApiTool } from "@/lib/features/integrations/application/api-v1";

// GET /api/v1/contacts?q=maria&limit=20 — busca por nome, e-mail ou telefone.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  return runApiTool(request, "search_contacts", {
    query: url.searchParams.get("q") ?? "",
    ...(limit ? { limit: Number(limit) } : {}),
  });
}
