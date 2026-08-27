/**
 * Consulta das respostas do lead a partir do NAVEGADOR.
 *
 * Arquivo separado de `ingest-queries.ts` de propósito, e não por gosto de
 * dividir: aquele importa `@/lib/supabase/admin`, que carrega a service role.
 * Um único import compartilhado arrastaria esse módulo para o bundle do
 * cliente. Aqui só entra o client anônimo, sujeito ao RLS.
 */
import { createClient } from "@/lib/supabase/client";

export interface LeadInfoResult {
  metadata: unknown;
  error: string | null;
}

/**
 * `metadata` da submissão mais recente que originou este lead.
 *
 * `form_submissions` não tem `organization_id`: quem a isola é a policy da
 * `0003`, que atravessa `forms`. Um lead de outra empresa devolve zero linhas
 * em vez de erro — por isso "sem resposta" e "sem permissão" são o mesmo
 * resultado aqui, e está correto que sejam.
 *
 * Só `metadata` é selecionado: `raw_data` repete nome, e-mail e telefone, que
 * a tela já mostra, e não precisa atravessar a rede.
 */
export async function loadLeadInfo(dealId: string): Promise<LeadInfoResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("form_submissions")
    .select("metadata")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[lead-info] falha ao carregar respostas do lead", error);
    return { metadata: null, error: "Não foi possível carregar as informações do lead." };
  }

  return { metadata: data?.metadata ?? null, error: null };
}
