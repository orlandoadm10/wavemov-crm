"use server";

import { changeOwnPassword } from "@/lib/features/account-security/application/password-changes";
import { createClient } from "@/lib/supabase/server";

export type PasswordActionState = { error?: string; success?: string } | null;

export async function changePasswordAction(
  _prev: PasswordActionState,
  formData: FormData
): Promise<PasswordActionState> {
  const result = await changeOwnPassword(await createClient(), {
    currentPassword: String(formData.get("current_password") ?? ""),
    newPassword: String(formData.get("new_password") ?? ""),
    confirmation: String(formData.get("confirmation") ?? ""),
  });
  return result.ok ? { success: "Senha alterada. Use a nova senha no próximo login." } : { error: result.error };
}
