"use server";

import { generateApiToken } from "@/lib/features/integrations/infrastructure/api-tokens";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { describeWriteError } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type TokenActionResult = { error?: string; success?: string; token?: string };

const DENIED = { error: "Apenas administradores da empresa gerenciam tokens de API." };

function isOrgAdmin(session: Awaited<ReturnType<typeof getSessionContext>>) {
  return session.membership.role === "org_admin" || session.profile.is_global_admin;
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome ao token (ex.: n8n produção).").max(60),
  scopes: z.array(z.enum(["api", "mcp"])).min(1, "Escolha ao menos um uso."),
  expiresInDays: z.coerce.number().int().min(0).max(3650),
});

/**
 * Cria o token e devolve o valor UMA vez. O banco guarda só o SHA-256
 * (0029); quem perder o valor revoga e cria outro.
 */
export async function createApiTokenAction(input: unknown): Promise<TokenActionResult> {
  const session = await getSessionContext();
  if (!isOrgAdmin(session)) return DENIED;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { token, hash, prefix } = generateApiToken();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_tokens")
    .insert({
      organization_id: session.organization.id,
      name: parsed.data.name,
      token_hash: hash,
      token_prefix: prefix,
      scopes: parsed.data.scopes,
      expires_at:
        parsed.data.expiresInDays > 0
          ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000).toISOString()
          : null,
      created_by: session.profile.id,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: describeWriteError(error, "Não foi possível criar o token.") };

  revalidatePath("/integracoes");
  return { success: "Token criado. Copie agora — ele não será exibido de novo.", token };
}

export async function revokeApiTokenAction(tokenId: string): Promise<TokenActionResult> {
  const session = await getSessionContext();
  if (!isOrgAdmin(session)) return DENIED;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("organization_id", session.organization.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: describeWriteError(error, "Não foi possível revogar o token.") };
  revalidatePath("/integracoes");
  return { success: "Token revogado. Integrações que o usavam param imediatamente." };
}
