import { runApiTool } from "@/lib/features/integrations/application/api-v1";

// GET /api/v1/pipelines — funis e etapas, na ordem (ids para mover leads).
export async function GET(request: Request) {
  return runApiTool(request, "list_pipelines", {});
}
