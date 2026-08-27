import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Caminhos que NÃO exigem sessão do CRM.
 *
 * As três rotas de `/api` aqui autenticam por conta própria, com o mecanismo
 * de quem as chama — e quem as chama nunca tem cookie de sessão:
 *
 *   - `/api/webhooks`  — segredo por instância WhatsApp (0010).
 *   - `/api/forms`     — submissão da página pública `/f/[slug]`, feita pelo
 *                        próprio lead, que não tem conta no CRM.
 *   - `/api/ingest`    — credencial por organização, no cabeçalho
 *                        `x-webhook-secret` (0014). Quem chama é o n8n.
 *
 * Estar nesta lista NÃO significa "sem autenticação": significa que o
 * middleware não é quem autentica. Antes de acrescentar um caminho aqui,
 * confirme que a rota recusa por conta própria.
 *
 * `/api/forms` estava faltando, e o efeito era silencioso e caro: o `fetch`
 * da página pública seguia o redirect até `/login`, que responde **200** com
 * HTML. `res.ok` ficava verdadeiro, o visitante via "Recebido com sucesso" e
 * nada era gravado. Lead perdido sem erro em lugar nenhum.
 */
const PUBLIC_PATHS = ["/login", "/register", "/f/", "/api/webhooks", "/api/forms", "/api/ingest"];

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

// Renova a sessão Supabase e protege rotas privadas.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: não remover — mantém a sessão sincronizada
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/register" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
