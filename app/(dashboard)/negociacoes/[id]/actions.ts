"use server";

import {
  DEFAULT_ANSWERS_KEY,
  diffLeadAnswers,
  parseLeadInfo,
} from "@/lib/features/lead-ingestion/domain/lead-answers";
import { getSessionContext } from "@/lib/services/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type LeadInfoUpdateResult = { error?: string; success?: string };

/** Teto do bloco. Não é limite de negócio: é o que impede um POST absurdo. */
const MAX_BLOCK_LENGTH = 20_000;

/**
 * Grava as Informações do Lead editadas à mão e registra a edição no histórico.
 *
 * POR QUE SERVER ACTION COM SERVICE ROLE
 * `form_submissions` só tem policy de SELECT (0003): a escrita sempre foi
 * exclusiva das rotas de ingestão. Abrir um `update` por RLS para todo membro
 * daria ao navegador poder de reescrever o registro do que a origem enviou.
 * Aqui a escrita é feita no servidor, com a organização vinda da SESSÃO e
 * conferida contra o lead antes de tocar em qualquer linha.
 *
 * A organização NUNCA vem do cliente: o parâmetro é o id do lead, e é a
 * consulta a `deals` filtrada pela organização da sessão que decide se esse
 * lead é mesmo desta empresa.
 */
export async function updateLeadInfoAction(
  dealId: string,
  blockText: string
): Promise<LeadInfoUpdateResult> {
  const session = await getSessionContext();

  // `viewer` é somente leitura desde a 0003 — o banco recusaria o histórico e
  // a tela não mostra o lápis para ele. Esta é a guarda do servidor.
  if (session.membership.role === "viewer") {
    return { error: "Seu perfil é somente leitura e não pode editar as informações do lead." };
  }

  if (blockText.length > MAX_BLOCK_LENGTH) {
    return { error: "As informações são longas demais. Reduza o texto e salve novamente." };
  }

  const organizationId = session.organization.id;
  const admin = createAdminClient();

  // 1. O lead é desta empresa? Sem isto, o id de um lead alheio bastaria.
  const { data: deal, error: dealError } = await admin
    .from("deals")
    .select("id")
    .eq("id", dealId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (dealError) {
    console.error("[lead-info] falha ao conferir o lead", dealError);
    return { error: "Não foi possível salvar agora. Tente novamente." };
  }
  if (!deal) {
    // Mesma resposta para "não existe" e "é de outra empresa": distinguir
    // transformaria a action num verificador de ids alheios.
    return { error: "Lead não encontrado." };
  }

  // 2. A submissão que originou o lead. Sem ela não há onde gravar: `form_id`
  //    é obrigatório em `form_submissions`, então um lead criado à mão ou pelo
  //    WhatsApp não tem esse registro.
  const { data: submission, error: submissionError } = await admin
    .from("form_submissions")
    .select("id, metadata, form:forms!inner(organization_id)")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (submissionError) {
    console.error("[lead-info] falha ao ler a submissão", submissionError);
    return { error: "Não foi possível salvar agora. Tente novamente." };
  }
  if (!submission) {
    return {
      error:
        "Este lead não veio de um formulário, então não há informações de origem para editar.",
    };
  }

  // 3. Defesa em profundidade: a submissão precisa ser de um formulário DESTA
  //    empresa. `deal_id` já veio de um lead conferido, mas o vínculo entre as
  //    duas tabelas não é garantido pelo banco.
  const form = submission.form as unknown as { organization_id: string } | null;
  if (!form || form.organization_id !== organizationId) {
    console.error("[lead-info] submissão de outra organização", { dealId, organizationId });
    return { error: "Lead não encontrado." };
  }

  const metadataAtual = (submission.metadata ?? {}) as Record<string, unknown>;
  const infoAntes = parseLeadInfo(metadataAtual);

  // Grava de volta na MESMA chave em que a origem mandou o bloco, preservando
  // todo o resto do `metadata` (utm, enriquecimento, ids). Inventar uma chave
  // nova deixaria dois blocos convivendo e a tela mostraria os dois.
  const chave = infoAntes.answersKey ?? DEFAULT_ANSWERS_KEY;
  const texto = blockText.trim();
  const metadataNovo = { ...metadataAtual, [chave]: texto };

  const infoDepois = parseLeadInfo(metadataNovo);
  const mudancas = diffLeadAnswers(infoAntes.answers, infoDepois.answers);

  if (mudancas.length === 0) {
    // Nada mudou: não suja o histórico com uma linha vazia de informação.
    return { success: "Nenhuma alteração a salvar." };
  }

  const { data: updated, error: updateError } = await admin
    .from("form_submissions")
    .update({ metadata: metadataNovo })
    .eq("id", submission.id)
    .select("id")
    .maybeSingle();

  // Escrita sob service role também confirma linha: sem o `.select()` um update
  // que não atingiu nada anunciaria sucesso e a tela voltaria ao valor antigo
  // no próximo carregamento, sem explicação.
  if (updateError || !updated) {
    console.error("[lead-info] falha ao gravar", updateError);
    return { error: "Não foi possível salvar as informações. Tente novamente." };
  }

  // 4. Histórico. O que muda aqui vira base de proposta comercial, então a
  //    edição precisa dizer O QUE mudou, não só que alguém mexeu.
  const { error: logError } = await admin.from("activity_logs").insert({
    organization_id: organizationId,
    deal_id: dealId,
    actor_id: session.profile.id,
    type: "lead_info_updated",
    title: `Informações do lead editadas (${mudancas.length} ${
      mudancas.length === 1 ? "alteração" : "alterações"
    })`,
    description: mudancas.join("\n"),
    metadata: { changes: mudancas },
  });

  if (logError) {
    // A edição já está gravada; recusá-la agora seria pior. Mas a lacuna no
    // histórico precisa aparecer para quem for auditar.
    console.error("[lead-info] informações salvas SEM registro no histórico", logError);
  }

  revalidatePath(`/negociacoes/${dealId}`);
  revalidatePath("/atendimento");
  return { success: "Informações do lead atualizadas." };
}
