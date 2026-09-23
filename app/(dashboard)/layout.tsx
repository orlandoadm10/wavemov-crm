import { AppShell } from "@/components/layout/app-shell";
import { AttentionProvider } from "@/components/layout/attention-provider";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/components/layout/nav-links";
import { seesAttention } from "@/lib/features/notifications/domain/attention";
import {
  EMPTY_ATTENTION,
  getAttention,
} from "@/lib/features/notifications/infrastructure/attention-queries";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  const supabase = await createClient();

  // Os três indicadores de atenção. Antes daqui havia uma contagem só, e ela
  // estava errada: contava `tasks` com `status='pending'` da ORGANIZAÇÃO
  // INTEIRA, sem olhar `due_at` nem `assigned_to`. O número no menu não mudava
  // quando você trabalhava — e por isso ninguém olhava para ele.
  //
  // `viewer` não conta nada: ele não conclui tarefa e não zera `unread_count`
  // (a escrita é barrada de propósito em `whatsapp-client.tsx`), então os
  // contadores dele subiriam para sempre. Ver `seesAttention`.
  const mostraAtencao = seesAttention(session.membership.role, session.profile.is_global_admin);
  const scope = { profileId: session.profile.id, organizationId: session.organization.id };
  const attention = mostraAtencao ? await getAttention(supabase, scope) : EMPTY_ATTENTION;

  // Lido no servidor para a primeira pintura já sair com a largura certa.
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1";

  return (
    <AttentionProvider initial={attention} scope={scope} enabled={mostraAtencao}>
      <AppShell session={session} initialCollapsed={sidebarCollapsed}>
        {children}
      </AppShell>
    </AttentionProvider>
  );
}
