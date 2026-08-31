// ============================================================
// Indicadores de atenção — leitura.
//
// As mesmas três consultas rodam no SERVIDOR (primeiro render, em
// `app/(dashboard)/layout.tsx`) e no CLIENTE (revalidação após evento do
// Realtime, no foco da janela e no intervalo). Por isso elas moram aqui e
// recebem o `SupabaseClient` de fora: duas cópias divergiriam, e um badge que
// discorda de si mesmo destrói a credibilidade dos três.
//
// SEM `service_role`, em nenhuma das duas pontas. Tudo passa pelas policies da
// `0011`, que é o que garante que `seller`/`agent` contem apenas o que podem
// abrir. Ainda assim, todo filtro é EXPLÍCITO — `organization_id` sempre, e o
// recorte por responsável também. Não é redundância: `can_access_conversation`
// é `SECURITY DEFINER` com três joins avaliada por linha, e filtrar antes
// reduz o conjunto candidato antes de a função rodar. Defesa em profundidade
// que também é performance.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  newLeadCutoff,
  NEW_LEAD_FETCH_LIMIT,
  UNKNOWN_COUNTS,
  type AttentionCounts,
  type AttentionScope,
} from "@/lib/features/notifications/domain/attention";

/**
 * Teto de conversas lidas para somar as mensagens.
 *
 * A soma exige as linhas (o Postgres somaria, o PostgREST não expõe `sum` sem
 * RPC). O teto protege o layout de toda página contra uma organização com
 * milhares de conversas pendentes; acima dele o badge já mostraria `99+`.
 */
const UNREAD_FETCH_LIMIT = 200;

export interface Attention {
  counts: AttentionCounts;
  /**
   * Leads novos, do mais recente para o mais antigo — alimenta o toast.
   *
   * Vem da mesma consulta que conta, porque o toast precisa do título. Uma
   * segunda consulta só para os títulos seria uma ida a mais ao banco em toda
   * revalidação.
   */
  newLeads: { id: string; title: string }[];
}

export const EMPTY_ATTENTION: Attention = { counts: UNKNOWN_COUNTS, newLeads: [] };

export async function getAttention(
  supabase: SupabaseClient,
  scope: AttentionScope,
  now: Date = new Date()
): Promise<Attention> {
  const [overdueTasks, unread, leads] = await Promise.all([
    countOverdueTasks(supabase, scope, now),
    readUnread(supabase, scope),
    readNewLeads(supabase, scope, now),
  ]);

  return {
    counts: {
      overdueTasks,
      unreadConversations: unread.conversations,
      unreadMessages: unread.messages,
      newLeads: leads === null ? null : leads.length,
    },
    newLeads: leads ?? [],
  };
}

/** `null` = a consulta falhou. Ver o contrato de `AttentionCounts`. */
async function countOverdueTasks(
  supabase: SupabaseClient,
  scope: AttentionScope,
  now: Date
): Promise<number | null> {
  // `head: true` — o layout precisa do número, nunca das linhas. É a consulta
  // que a 0023 indexa.
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", scope.organizationId)
    .eq("assigned_to", scope.profileId)
    .eq("status", "pending")
    .lt("due_at", now.toISOString());

  if (error) {
    console.error("[atencao] falha ao contar tarefas vencidas", error);
    return null;
  }
  return count ?? 0;
}

/**
 * Conversas aguardando resposta, e quantas mensagens elas acumulam.
 *
 * O recorte é "minhas + sem responsável", para TODOS os papéis. Dar ao
 * `org_admin` a soma da empresa parece generoso e é armadilha: esse número
 * depende de a equipe inteira ler as conversas dela, nunca chega a zero, e o
 * badge morre por irrelevância em duas semanas. A fila sem responsável entra
 * porque não é de ninguém — se ficar invisível, ninguém a puxa.
 */
async function readUnread(
  supabase: SupabaseClient,
  scope: AttentionScope
): Promise<{ conversations: number | null; messages: number | null }> {
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("id, unread_count")
    .eq("organization_id", scope.organizationId)
    .gt("unread_count", 0)
    .or(`assigned_to.eq.${scope.profileId},assigned_to.is.null`)
    .limit(UNREAD_FETCH_LIMIT);

  if (error) {
    console.error("[atencao] falha ao ler conversas não lidas", error);
    return { conversations: null, messages: null };
  }

  const linhas = data ?? [];
  return {
    conversations: linhas.length,
    messages: linhas.reduce((soma, c) => soma + Number(c.unread_count ?? 0), 0),
  };
}

/**
 * Leads das últimas 24h que são meus ou estão órfãos.
 *
 * `status = 'open'` porque lead que já foi ganho ou perdido não está esperando
 * ninguém — contá-lo seria cobrar trabalho já feito.
 */
async function readNewLeads(
  supabase: SupabaseClient,
  scope: AttentionScope,
  now: Date
): Promise<{ id: string; title: string }[] | null> {
  const { data, error } = await supabase
    .from("deals")
    .select("id, title")
    .eq("organization_id", scope.organizationId)
    .eq("status", "open")
    .gte("created_at", newLeadCutoff(now).toISOString())
    .or(`responsible_id.eq.${scope.profileId},responsible_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(NEW_LEAD_FETCH_LIMIT);

  if (error) {
    console.error("[atencao] falha ao ler leads novos", error);
    return null;
  }

  return (data ?? []).map((d) => ({ id: d.id as string, title: (d.title as string) ?? "Lead" }));
}
