// ============================================================
// Regra da senha nova — uma só, usada pelos três caminhos de troca:
// perfil (a própria pessoa), redefinição por e-mail e redefinição feita pelo
// administrador em Pessoas. Três cópias divergiriam na primeira mudança.
//
// 8 caracteres é o mínimo que o cadastro já exigia. 72 é o teto do bcrypt
// usado pelo Supabase Auth: o que passar disso é ignorado em silêncio, e a
// pessoa acharia que a senha longa inteira vale.
// ============================================================

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

/** Erro em português, ou `null` quando a senha nova pode ser gravada. */
export function newPasswordError(password: string, confirmation: string): string | null {
  if (password.length < PASSWORD_MIN) return `A senha precisa de pelo menos ${PASSWORD_MIN} caracteres.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) {
    return `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`;
  }
  if (password.trim() !== password) return "A senha não pode começar nem terminar com espaço.";
  if (password !== confirmation) return "A confirmação não é igual à senha nova.";
  return null;
}

/**
 * Só caminhos internos depois do link do e-mail. Um `next` vindo da URL não
 * pode levar a pessoa para fora do CRM logo depois de ela receber uma sessão.
 */
export function safeInternalPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
