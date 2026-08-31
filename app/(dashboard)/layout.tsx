import { AttentionProvider } from "@/components/layout/attention-provider";
import { TopNav } from "@/components/layout/top-nav";
import { seesAttention } from "@/lib/features/notifications/domain/attention";
import {
  EMPTY_ATTENTION,
  getAttention,
} from "@/lib/features/notifications/infrastructure/attention-queries";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";

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

  return (
    <AttentionProvider initial={attention} scope={scope} enabled={mostraAtencao}>
      <div className="min-h-screen">
        <TopNav session={session} />
        <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
      </div>
    </AttentionProvider>
  );
}
