import { ACTIVE_ORG_COOKIE } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

// Troca a organização ativa (cookie). RLS garante que só orgs
// acessíveis retornam dados; aqui validamos para UX consistente.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = z.object({ organization_id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", parsed.data.organization_id)
    .maybeSingle();

  if (!org) {
    return NextResponse.json({ error: "Sem acesso a esta organização" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, org.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ ok: true });
}
