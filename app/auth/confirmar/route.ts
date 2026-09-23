import { safeInternalPath } from "@/lib/features/account-security/domain/password-policy";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Destino do link de e-mail do Supabase Auth (redefinição de senha).
 *
 * Aceita os dois formatos que o Supabase pode entregar:
 * - `?code=` (fluxo PKCE, o padrão do @supabase/ssr) — só funciona no mesmo
 *   navegador em que o pedido foi feito, porque o verificador fica num cookie;
 * - `?token_hash=&type=recovery` — quando o template de e-mail do projeto usa
 *   `{{ .TokenHash }}`; funciona em qualquer navegador.
 *
 * Em sucesso a pessoa sai daqui com uma sessão e vai para `next`, que só pode
 * ser um caminho interno.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeInternalPath(searchParams.get("next"), "/redefinir-senha");
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  const url = new URL(ok ? next : "/esqueci-senha?link=invalido", origin);
  return NextResponse.redirect(url);
}
