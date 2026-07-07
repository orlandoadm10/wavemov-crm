import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client com service role — USO EXCLUSIVO NO SERVIDOR.
// Ignora RLS: usado por webhooks (UAZAPI), formulários públicos e admin global.
// NUNCA importe este módulo em componentes client.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada. Defina no .env.local (apenas servidor)."
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
