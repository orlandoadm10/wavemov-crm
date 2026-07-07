"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { memberSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";

export type ActionResult = { error?: string; success?: string } | null;

// Garante que quem chama é org_admin da organização (ou admin global)
async function assertOrgAdmin(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_org_admin", { org_id: organizationId });
  if (error || !data) throw new Error("Sem permissão para gerenciar pessoas desta empresa.");
}

export async function createMemberAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const organizationId = String(formData.get("organization_id") ?? "");
  const password = String(formData.get("password") ?? "");

  const parsed = memberSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    job_title: formData.get("job_title"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (password.length < 8) return { error: "Senha inicial precisa de 8+ caracteres." };

  try {
    await assertOrgAdmin(organizationId);
  } catch (e) {
    return { error: (e as Error).message };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error:
        "SUPABASE_SERVICE_ROLE_KEY não configurada — necessária para criar usuários.",
    };
  }

  const admin = createAdminClient();
  const data = parsed.data;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: data.email,
    password,
    email_confirm: true,
    user_metadata: { first_name: data.first_name, last_name: data.last_name },
  });
  if (createError) {
    return {
      error: createError.message.includes("already")
        ? "Já existe um usuário com este e-mail."
        : createError.message,
    };
  }

  // O trigger handle_new_user cria o profile — busca para completar os dados
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", created.user.id)
    .single();
  if (profileError || !profile) {
    return { error: "Usuário criado, mas o perfil não foi encontrado." };
  }

  await admin
    .from("profiles")
    .update({ phone: data.phone || null, job_title: data.job_title || null })
    .eq("id", profile.id);

  const { error: memberError } = await admin.from("organization_members").insert({
    organization_id: organizationId,
    profile_id: profile.id,
    role: data.role,
  });
  if (memberError) return { error: memberError.message };

  revalidatePath("/pessoas");
  return { success: `${data.first_name} adicionado(a) com sucesso.` };
}
