// ============================================================
// Saúde da entrada de leads — leitura.
//
// Três consultas curtas, todas `limit 1`, todas sob a RLS de quem chama. Não
// há `service_role` aqui de propósito: o painel mostra um agregado da
// organização, e quem já enxerga a organização inteira pelo RLS não precisa
// de privilégio extra para contar o que enxerga.
//
// QUEM PODE CHAMAR — leia antes de reaproveitar
// Só papéis com visão completa da organização: `org_admin`, `viewer` e admin
// global. NUNCA `seller`/`agent`. Desde a 0011 eles leem apenas as próprias
// conversas, então a consulta do WhatsApp devolveria "12 dias sem receber"
// para um vendedor num dia quieto, com a empresa recebendo normalmente. Um
// indicador de organização calculado com visão parcial é alarme falso por
// construção, e alarme falso mata o alarme. A guarda fica em quem chama —
// `page.tsx` —, mas o motivo está registrado aqui.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateChannel,
  type ChannelHealth,
} from "@/lib/features/lead-ingestion/domain/ingestion-health";

export interface IngestionHealth {
  whatsapp: ChannelHealth;
  externalIngest: ChannelHealth;
  publicForm: ChannelHealth;
  /** Todos, na ordem em que o painel os desenha. */
  all: ChannelHealth[];
}

/** Uma linha por formulário — alimenta o painel n8n de `/formularios`. */
export interface FormHealth {
  formId: string;
  name: string;
  externalId: string | null;
  isActive: boolean;
  health: ChannelHealth;
}

/**
 * Última entrada RECEBIDA de cada canal, já avaliada pela regra.
 *
 * `now` é injetável para teste e para manter a página coerente: as três
 * avaliações precisam usar o mesmo instante, senão dois canais na mesma tela
 * podem discordar sobre que horas são.
 */
export async function getIngestionHealth(
  supabase: SupabaseClient,
  organizationId: string,
  now: Date = new Date()
): Promise<IngestionHealth> {
  const [whatsapp, forms] = await Promise.all([
    whatsappChannel(supabase, organizationId, now),
    formChannels(supabase, organizationId, now),
  ]);

  const health: IngestionHealth = {
    whatsapp,
    externalIngest: forms.externalIngest,
    publicForm: forms.publicForm,
    all: [whatsapp, forms.externalIngest, forms.publicForm],
  };
  return health;
}

async function whatsappChannel(
  supabase: SupabaseClient,
  organizationId: string,
  now: Date
): Promise<ChannelHealth> {
  // Configurado = existe instância cadastrada. Não é o mesmo que "conectada":
  // uma instância desconectada continua sendo uma integração que a empresa
  // espera receber, e é justamente aí que o silêncio precisa aparecer.
  const [
    { count: instances, error: instancesError },
    { data: lastInbound, error: inboundError },
  ] = await Promise.all([
    supabase
      .from("whatsapp_instances")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    // `direction = 'inbound'` é o ponto do indicador inteiro. A coluna
    // `whatsapp_conversations.last_message_at` responderia mais rápido e
    // estaria ERRADA: o envio também escreve nela, e foi essa contaminação
    // que escondeu o incidente de 26/08 por quatro dias.
    //
    // Este é o `order by ... limit 1` que a 0022 indexa.
    supabase
      .from("whatsapp_messages")
      .select("created_at")
      .eq("organization_id", organizationId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Erro vira `unknown`, nunca "aguardando". Um indicador de falha silenciosa
  // que responde com falso conforto quando ele mesmo falha não vale nada.
  if (instancesError || inboundError) {
    console.error("[saude-entrada] falha ao apurar o WhatsApp", instancesError ?? inboundError);
    return evaluateChannel("whatsapp", { failed: true, configured: false, lastReceivedAt: null }, now);
  }

  return evaluateChannel(
    "whatsapp",
    { configured: (instances ?? 0) > 0, lastReceivedAt: lastInbound?.created_at ?? null },
    now
  );
}

/**
 * n8n e formulário público saem da mesma tabela, separados por
 * `form_submissions.source` (0014).
 *
 * `form_submissions` não tem `organization_id`: a empresa vem de `forms`. Por
 * isso a consulta resolve primeiro os formulários da organização e depois
 * pergunta pelas submissões deles — é também o que permite montar a linha por
 * formulário sem uma segunda ida ao banco.
 */
async function formChannels(
  supabase: SupabaseClient,
  organizationId: string,
  now: Date
): Promise<{ externalIngest: ChannelHealth; publicForm: ChannelHealth }> {
  const { data: forms, error: formsError } = await supabase
    .from("forms")
    .select("id, external_id, is_active")
    .eq("organization_id", organizationId);

  if (formsError) {
    console.error("[saude-entrada] falha ao apurar os formulários", formsError);
    const falhou = { failed: true, configured: false, lastReceivedAt: null };
    return {
      externalIngest: evaluateChannel("external_ingest", falhou, now),
      publicForm: evaluateChannel("public_form", falhou, now),
    };
  }

  const todos = forms ?? [];
  const conectados = todos.filter((f) => f.external_id);

  const [externo, publico] = await Promise.all([
    lastSubmission(supabase, conectados.map((f) => f.id as string), "external_ingest"),
    lastSubmission(supabase, todos.map((f) => f.id as string), "public_form"),
  ]);

  return {
    externalIngest: evaluateChannel(
      "external_ingest",
      // Conectado ao n8n = tem `external_id`. Formulário sem ele nunca vai
      // receber pela integração, e cobrá-lo disso seria alarme sobre algo que
      // ninguém pediu.
      {
        failed: externo === undefined,
        configured: conectados.length > 0,
        lastReceivedAt: externo ?? null,
      },
      now
    ),
    publicForm: evaluateChannel(
      "public_form",
      {
        failed: publico === undefined,
        configured: todos.some((f) => f.is_active),
        lastReceivedAt: publico ?? null,
      },
      now
    ),
  };
}

/** `undefined` = a leitura falhou; `null` = leu e não há submissão. */
async function lastSubmission(
  supabase: SupabaseClient,
  formIds: string[],
  source: "external_ingest" | "public_form"
): Promise<string | null | undefined> {
  if (formIds.length === 0) return null;
  const { data, error } = await supabase
    .from("form_submissions")
    .select("created_at")
    .in("form_id", formIds)
    .eq("source", source)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[saude-entrada] falha ao ler form_submissions", { source, error });
    return undefined;
  }
  return (data?.created_at as string | undefined) ?? null;
}

/**
 * Uma linha de saúde por formulário conectado ao n8n.
 *
 * Serve ao painel de `/formularios`, onde a pergunta é mais fina que a do
 * banner: não é "a integração está viva", é "qual fluxo parou". Só entram
 * formulários com `external_id` — os outros não têm integração para adoecer.
 */
export async function getFormsHealth(
  supabase: SupabaseClient,
  organizationId: string,
  now: Date = new Date()
): Promise<FormHealth[]> {
  const { data: forms } = await supabase
    .from("forms")
    .select("id, name, external_id, is_active")
    .eq("organization_id", organizationId)
    .not("external_id", "is", null)
    .order("name");

  const conectados = forms ?? [];
  if (conectados.length === 0) return [];

  return Promise.all(
    conectados.map(async (form) => {
      const lastReceivedAt = await lastSubmission(supabase, [form.id as string], "external_ingest");
      return {
        formId: form.id as string,
        name: form.name as string,
        externalId: (form.external_id as string | null) ?? null,
        isActive: Boolean(form.is_active),
        // Formulário inativo não recebe por decisão da empresa: o estado é
        // "desligado", não "em silêncio". Marcá-lo em vermelho ensinaria a
        // equipe a ignorar o vermelho.
        health: evaluateChannel(
          "external_ingest",
          {
            failed: lastReceivedAt === undefined,
            configured: Boolean(form.is_active),
            lastReceivedAt: lastReceivedAt ?? null,
          },
          now
        ),
      } satisfies FormHealth;
    })
  );
}
