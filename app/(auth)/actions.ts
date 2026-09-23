"use server";

import { setPasswordFromRecovery } from "@/lib/features/account-security/application/password-changes";
import { loginSchema, registerSchema } from "@/lib/validations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type AuthState = { error?: string } | null;

export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: "E-mail ou senha inválidos." };
  }

  redirect("/dashboard");
}

export async function registerAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    organization_name: formData.get("organization_name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const data = parsed.data;
  const supabase = await createClient();

  // Com service role: cria o usuário já confirmado (melhor DX em dev).
  // Sem service role: signUp normal (pode exigir confirmação de e-mail).
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { first_name: data.first_name, last_name: data.last_name },
    });
    if (error) {
      return { error: error.message.includes("already") ? "E-mail já cadastrado." : error.message };
    }
  } else {
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { first_name: data.first_name, last_name: data.last_name },
      },
    });
    if (error) return { error: error.message };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });
  if (signInError) {
    return {
      error:
        "Conta criada! Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).",
    };
  }

  // Cria a organização + funil padrão + etapas via função SQL
  const { error: orgError } = await supabase.rpc(
    "create_organization_for_current_user",
    { org_name: data.organization_name, org_segment: null }
  );
  if (orgError) {
    return { error: `Conta criada, mas falhou ao criar a empresa: ${orgError.message}` };
  }

  redirect("/dashboard");
}

export async function createOrgAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const name = String(formData.get("organization_name") ?? "").trim();
  if (name.length < 2) return { error: "Informe o nome da empresa." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization_for_current_user", {
    org_name: name,
    org_segment: String(formData.get("segment") ?? "") || null,
  });
  if (error) return { error: error.message };

  redirect("/onboarding");
}

// ------------------------------------------------------------
// Esqueci minha senha
// ------------------------------------------------------------
export type PasswordResetState = { error?: string; sent?: boolean } | null;

export async function requestPasswordResetAction(
  _prev: PasswordResetState,
  formData: FormData
): Promise<PasswordResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Informe um e-mail válido." };

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/confirmar?next=/redefinir-senha`,
  });
  // Mesma resposta exista ou não a conta: a tela não pode servir para
  // descobrir quais e-mails têm acesso ao CRM. Só o limite de envio aparece,
  // porque sem ele a pessoa esperaria um e-mail que não vai chegar.
  if (error && error.status === 429) {
    return { error: "Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo." };
  }
  if (error) console.error("[senha] falha ao pedir redefinição", error.message);
  return { sent: true };
}

export async function setNewPasswordAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const result = await setPasswordFromRecovery(await createClient(), {
    newPassword: String(formData.get("new_password") ?? ""),
    confirmation: String(formData.get("confirmation") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  redirect("/dashboard?senha=alterada");
}
