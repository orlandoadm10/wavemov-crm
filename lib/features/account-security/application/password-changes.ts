// ============================================================
// Troca de senha — os casos de uso de servidor.
//
// Tudo que grava senha passa por `auth.admin.updateUserById` (service role),
// DEPOIS de provar quem pede:
// - a própria pessoa prova com a senha atual (conferida num cliente isolado,
//   que não toca nos cookies da sessão);
// - o administrador prova pelo papel, e só alcança quem pertence SOMENTE à
//   empresa dele. Uma pessoa que também é membro de outra empresa não pode ter
//   a senha trocada por um admin de uma delas: seria tomar a conta dela na
//   outra empresa — o vazamento entre organizações que a regra 1 do HANDOFF
//   proíbe.
//
// Por que não `auth.updateUser` na sessão: com "Secure password change"
// ligado no Supabase, ele exige login recente ou código por e-mail, e a troca
// falharia para quem está logado há mais de um dia. A prova aqui é explícita.
// ============================================================
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { newPasswordError } from "@/lib/features/account-security/domain/password-policy";
import { createAdminClient } from "@/lib/supabase/admin";

export type PasswordChangeResult = { ok: true } | { ok: false; error: string };

const GENERIC_FAILURE = "Não foi possível trocar a senha agora. Tente novamente.";

function serviceRoleReady(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Confere e-mail + senha sem criar nem alterar a sessão do navegador. */
async function passwordMatches(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  const isolated = createSupabaseClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await isolated.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  // A sessão criada só para a conferência não deve ficar válida por aí.
  await isolated.auth.signOut({ scope: "local" });
  return true;
}

export async function changeOwnPassword(
  sessionClient: SupabaseClient,
  input: { currentPassword: string; newPassword: string; confirmation: string }
): Promise<PasswordChangeResult> {
  const policyError = newPasswordError(input.newPassword, input.confirmation);
  if (policyError) return { ok: false, error: policyError };
  if (input.newPassword === input.currentPassword) {
    return { ok: false, error: "A senha nova precisa ser diferente da atual." };
  }
  if (!serviceRoleReady()) return { ok: false, error: GENERIC_FAILURE };

  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user?.email) return { ok: false, error: "Sessão expirada. Entre de novo." };

  if (!(await passwordMatches(user.email, input.currentPassword))) {
    return { ok: false, error: "A senha atual está incorreta." };
  }

  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
    password: input.newPassword,
  });
  return error ? { ok: false, error: GENERIC_FAILURE } : { ok: true };
}

/** Senha nova de quem abriu o link de redefinição (sessão de recuperação). */
export async function setPasswordFromRecovery(
  sessionClient: SupabaseClient,
  input: { newPassword: string; confirmation: string }
): Promise<PasswordChangeResult> {
  const policyError = newPasswordError(input.newPassword, input.confirmation);
  if (policyError) return { ok: false, error: policyError };
  if (!serviceRoleReady()) return { ok: false, error: GENERIC_FAILURE };

  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) return { ok: false, error: "O link expirou. Peça um novo em “Esqueci minha senha”." };

  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
    password: input.newPassword,
  });
  return error ? { ok: false, error: GENERIC_FAILURE } : { ok: true };
}

export async function resetMemberPassword(
  sessionClient: SupabaseClient,
  input: {
    organizationId: string;
    memberProfileId: string;
    callerProfileId: string;
    callerIsGlobalAdmin: boolean;
    newPassword: string;
    confirmation: string;
  }
): Promise<PasswordChangeResult> {
  const policyError = newPasswordError(input.newPassword, input.confirmation);
  if (policyError) return { ok: false, error: policyError };
  if (input.memberProfileId === input.callerProfileId) {
    return { ok: false, error: "Para trocar a sua própria senha, use Meu perfil." };
  }
  if (!serviceRoleReady()) return { ok: false, error: GENERIC_FAILURE };

  // O papel é conferido pela sessão (RLS/RPC), nunca pelo formulário.
  const { data: isAdmin, error: roleError } = await sessionClient.rpc("is_org_admin", {
    org_id: input.organizationId,
  });
  if (roleError || !isAdmin) {
    return { ok: false, error: "Somente administradores da empresa redefinem senhas." };
  }

  const admin = createAdminClient();
  const { data: memberships, error: membershipError } = await admin
    .from("organization_members")
    .select("organization_id, profile:profiles(auth_user_id, is_global_admin)")
    .eq("profile_id", input.memberProfileId);
  if (membershipError || !memberships?.length) return { ok: false, error: GENERIC_FAILURE };

  if (!memberships.some((m) => m.organization_id === input.organizationId)) {
    return { ok: false, error: "Esta pessoa não pertence a esta empresa." };
  }
  const profile = memberships[0].profile as unknown as {
    auth_user_id: string | null;
    is_global_admin: boolean;
  } | null;
  if (!profile?.auth_user_id) return { ok: false, error: "Esta pessoa ainda não tem acesso ao CRM." };
  if (profile.is_global_admin && !input.callerIsGlobalAdmin) {
    return { ok: false, error: "A senha de um administrador global só é trocada por ele mesmo." };
  }
  const inOtherOrganization = memberships.some((m) => m.organization_id !== input.organizationId);
  if (inOtherOrganization && !input.callerIsGlobalAdmin) {
    return {
      ok: false,
      error:
        "Esta pessoa também tem acesso a outra empresa. Peça que ela use “Esqueci minha senha” no login.",
    };
  }

  const { error } = await admin.auth.admin.updateUserById(profile.auth_user_id, {
    password: input.newPassword,
  });
  return error ? { ok: false, error: GENERIC_FAILURE } : { ok: true };
}
