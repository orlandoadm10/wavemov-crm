import { extractInstanceRefs, normalizeWebhookMessage } from "@/lib/services/uazapi";
import { secretsMatch } from "@/lib/services/webhook-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// ============================================================
// POST /api/webhooks/uazapi?org=<organization_id>&secret=<segredo>
//
// Recebe mensagens da UAZAPI:
// 1. Autentica pelo segredo da instância (whatsapp_instances.webhook_secret)
// 2. Normaliza o payload (formatos variam entre versões)
// 3. Cria/atualiza contato pelo telefone
// 4. Cria conversa se não existir
// 5. Salva a mensagem
// 6. Cria lead automático na primeira etapa do funil (inbound novo)
// 7. Registra atividade no histórico do lead
// ============================================================
export async function POST(request: Request) {
  const url = new URL(request.url);
  const presentedSecret =
    url.searchParams.get("secret") ??
    request.headers.get("x-webhook-secret") ??
    "";

  if (!presentedSecret) {
    return NextResponse.json({ error: "Segredo inválido." }, { status: 401 });
  }

  const admin = createAdminClient();

  // ------------------------------------------------------------
  // Autenticação — segredo POR INSTÂNCIA (corte limpo, sem legado)
  //
  // Antes existia um único `UAZAPI_WEBHOOK_SECRET` para toda a base: quem
  // lesse a tela de configurações de qualquer empresa ficava com a chave do
  // CRM inteiro e podia, com o UUID de outra organização, forjar mensagens e
  // criar leads na conta alheia (esta rota usa `service_role`, o RLS não
  // protege nada aqui). Agora cada instância tem o próprio segredo
  // (migration 0010), e é ele que prova a origem.
  //
  // O segredo global NÃO é mais aceito. Havia a opção de aceitar os dois em
  // paralelo para não derrubar webhooks já configurados, mas existe uma
  // única instância cadastrada em produção: é um painel da UAZAPI para
  // reconfigurar, contra código de compatibilidade que ninguém removeria
  // depois. `UAZAPI_WEBHOOK_SECRET` deixou de ser lido em qualquer lugar.
  // ------------------------------------------------------------

  // Lookup pelo índice único de `webhook_secret` (0010): um segredo nunca
  // aponta para duas organizações. A igualdade acontece dentro do Postgres,
  // sobre um valor de 244+ bits — não há oráculo de tempo prático aí; a
  // comparação em JS abaixo é a que precisa ser constante.
  const { data: instanceBySecret, error: secretLookupError } = await admin
    .from("whatsapp_instances")
    .select("id, organization_id, webhook_secret")
    .eq("webhook_secret", presentedSecret)
    .maybeSingle();

  // Sem a 0010 aplicada a coluna não existe e a consulta falha: o webhook
  // recusa tudo com 401 até a migration rodar. É o comportamento certo
  // (recusar em vez de adivinhar), mas o motivo precisa estar no log —
  // senão vira "parou de chegar mensagem" sem explicação.
  if (secretLookupError) {
    console.error(
      "[uazapi-webhook] falha ao consultar webhook_secret — a migration 0010 foi aplicada?",
      secretLookupError
    );
  }

  // Reconfere em tempo constante: garante que nenhuma mudança futura no
  // filtro (case-insensitive, `like`, coluna sem unique) transforme um
  // "quase igual" em autenticação válida.
  const authenticated =
    instanceBySecret && secretsMatch(presentedSecret, instanceBySecret.webhook_secret)
      ? instanceBySecret
      : null;
  const tokenOrganizationId = (authenticated?.organization_id as string | undefined) ?? null;
  // O segredo identifica a INSTÂNCIA, não só a empresa: é o que permite
  // gravar na conversa por qual número a mensagem entrou.
  const instanceId = (authenticated?.id as string | undefined) ?? null;

  if (!tokenOrganizationId) {
    // Nunca registre o valor apresentado: o log viraria o próprio vazamento
    // quando o segredo estiver certo e a falha for outra.
    console.warn("[uazapi-webhook] segredo não reconhecido", {
      hasOrgParam: url.searchParams.has("org"),
      viaHeader: !url.searchParams.has("secret"),
    });
    return NextResponse.json({ error: "Segredo inválido." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  // ------------------------------------------------------------
  // Organização alvo — resolvida sempre de forma determinística.
  //
  // O fallback antigo pegava a primeira linha de `whatsapp_instances` da
  // tabela inteira, sem filtro de organização: numa base multiempresa isso
  // gravava contato, conversa e lead de uma empresa dentro da organização
  // de outra. Agora: identifica a instância pelo token/id do próprio payload,
  // confere contra o `?org=` da URL (divergência = 403, porque o segredo do
  // webhook é o mesmo para todas as empresas) e só cai na instância existente
  // quando há exatamente uma — o único caso em que "a primeira" não é ambíguo.
  // ------------------------------------------------------------
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // `?org=` inválido não pode seguir adiante: as queries devolveriam 22P02 e a
  // cadeia degradaria até um 500 genérico, que a UAZAPI reenviaria em loop.
  const orgParam = url.searchParams.get("org");
  if (orgParam && !UUID_RE.test(orgParam)) {
    return NextResponse.json({ error: "Parâmetro `org` inválido." }, { status: 400 });
  }

  // Organização identificada pelo token/instance_id do próprio payload.
  // Só vale quando resolve para UMA instância: `whatsapp_instances` não tem
  // índice único nessas colunas, e escolher "a primeira" seria repetir o bug.
  let refOrganizationId: string | null = null;
  const instanceRefs = extractInstanceRefs(payload);
  for (const ref of instanceRefs) {
    for (const column of ["token_encrypted", "instance_id"] as const) {
      const { data, count } = await admin
        .from("whatsapp_instances")
        .select("organization_id", { count: "exact" })
        .eq(column, ref)
        .limit(2);
      if (count === 1 && data?.[0]) {
        refOrganizationId = data[0].organization_id as string;
        break;
      }
    }
    if (refOrganizationId) break;
  }

  // Quando as duas fontes existem e discordam, a URL não vence: `?org=` é
  // controlado por quem chama. O segredo identifica a instância, e a
  // organização informada precisa conferir com ela.
  if (orgParam && refOrganizationId && orgParam !== refOrganizationId) {
    console.error("[uazapi-webhook] `org` da URL diverge da instância do payload", {
      orgParam,
      refOrganizationId,
    });
    return NextResponse.json({ error: "Organização não confere." }, { status: 403 });
  }

  let organizationId = orgParam ?? refOrganizationId;

  if (!organizationId) {
    // Último recurso: só é seguro quando existe exatamente uma instância.
    const { count } = await admin
      .from("whatsapp_instances")
      .select("id", { count: "exact", head: true });

    if (count === 1) {
      const { data: onlyInstance } = await admin
        .from("whatsapp_instances")
        .select("organization_id")
        .limit(1)
        .maybeSingle();
      organizationId = onlyInstance?.organization_id ?? null;
    }

    if (!organizationId) {
      console.error("[uazapi-webhook] organização não resolvida", {
        hasOrgParam: Boolean(orgParam),
        instanceRefs: instanceRefs.length,
        instanceCount: count,
      });
      return NextResponse.json(
        { error: "Organização não identificada. Use ?org=<id> na URL do webhook." },
        { status: 400 }
      );
    }
  }

  // ------------------------------------------------------------
  // O segredo manda: a organização resolvida acima precisa ser a mesma que
  // o segredo autenticou. Sem isso, um `?org=` apontando para outra empresa
  // continuaria escrevendo lá — que é a falha original, só que partindo do
  // segredo válido de uma conta qualquer.
  //
  // Nota para quem for mexer aqui: com o segredo por instância, o bloco de
  // resolução acima virou redundante — `tokenOrganizationId` já é a resposta,
  // e o fallback de `count === 1` na tabela inteira deixa de ser verdade assim
  // que existir a segunda instância. Não foi simplificado nesta entrega de
  // propósito (aquele código acabou de ser auditado); a checagem abaixo é
  // aditiva. Consequência enquanto os dois convivem: uma URL sem `?org=`,
  // cujo payload não bata com `token_encrypted`/`instance_id`, ainda cai no
  // 400 de "organização não identificada" mesmo com segredo válido — a URL
  // gerada pela tela sempre traz `?org=`, então isso só afeta URL editada
  // à mão.
  // ------------------------------------------------------------
  if (organizationId !== tokenOrganizationId) {
    console.error("[uazapi-webhook] organização resolvida diverge do segredo apresentado", {
      organizationId,
      tokenOrganizationId,
    });
    return NextResponse.json({ error: "Organização não confere." }, { status: 403 });
  }

  const msg = normalizeWebhookMessage(payload as Record<string, never>);
  if (!msg) {
    // Evento não relacionado a mensagem (status, presença etc.) — ack silencioso
    return NextResponse.json({ ok: true, skipped: true });
  }

  const phone = msg.fromMe ? (msg.toPhone ?? msg.fromPhone) : msg.fromPhone;

  // ---------- Contato ----------
  let { data: contact } = await admin
    .from("contacts")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("whatsapp_phone", phone)
    .maybeSingle();

  if (!contact) {
    const { data: created } = await admin
      .from("contacts")
      .insert({
        organization_id: organizationId,
        name: msg.senderName ?? `WhatsApp +${phone}`,
        whatsapp_phone: phone,
        phone: `+${phone}`,
      })
      .select("id, name")
      .single();
    contact = created;
  }

  // ---------- Conversa ----------
  let { data: conversation } = await admin
    .from("whatsapp_conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("instance_id", instanceId)
    .eq("phone", phone)
    .maybeSingle();

  // Conversas anteriores à 0010 não guardavam a instância. Reaproveita a
  // única linha legada e a vincula à instância autenticada; uma mensagem que
  // chegar por outra instância criará outra conversa para o mesmo lead.
  if (!conversation && instanceId) {
    const { data: legacyConversation } = await admin
      .from("whatsapp_conversations")
      .select("*")
      .eq("organization_id", organizationId)
      .is("instance_id", null)
      .eq("phone", phone)
      .maybeSingle();

    if (legacyConversation) {
      const { data: migratedConversation } = await admin
        .from("whatsapp_conversations")
        .update({ instance_id: instanceId })
        .eq("id", legacyConversation.id)
        .eq("organization_id", organizationId)
        .select("*")
        .single();
      conversation = migratedConversation;
    }
  }

  if (!conversation) {
    // A instância vem do segredo que autenticou a requisição — não de um
    // `.limit(1)` na organização. Uma empresa pode ter mais de um atendente
    // conectado, e "a primeira instância da empresa" faria a resposta sair
    // pelo número errado (ver `app/api/uazapi/send/route.ts`).
    const { data: created } = await admin
      .from("whatsapp_conversations")
      .insert({
        organization_id: organizationId,
        instance_id: instanceId,
        contact_id: contact?.id ?? null,
        phone,
        name: msg.senderName ?? contact?.name ?? `+${phone}`,
        status: "open",
      })
      .select("*")
      .single();
    conversation = created;
  }

  if (!conversation) {
    return NextResponse.json({ error: "Falha ao criar conversa." }, { status: 500 });
  }

  // ---------- Lead automático (só para mensagens recebidas) ----------
  let dealId = conversation.deal_id as string | null;
  if (!dealId && !msg.fromMe) {
    const { data: openDeal } = await admin
      .from("deals")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("contact_id", contact?.id ?? "")
      .eq("status", "open")
      .limit(1)
      .maybeSingle();

    if (openDeal) {
      dealId = openDeal.id;
    } else {
      const { data: pipeline } = await admin
        .from("pipelines")
        .select("id")
        .eq("organization_id", organizationId)
        .order("created_at")
        .limit(1)
        .maybeSingle();

      if (pipeline) {
        const { data: firstStage } = await admin
          .from("pipeline_stages")
          .select("id")
          .eq("pipeline_id", pipeline.id)
          .eq("is_won_stage", false)
          .eq("is_lost_stage", false)
          .order("order_index")
          .limit(1)
          .maybeSingle();

        if (firstStage) {
          const { data: deal } = await admin
            .from("deals")
            .insert({
              organization_id: organizationId,
              pipeline_id: pipeline.id,
              stage_id: firstStage.id,
              contact_id: contact?.id ?? null,
              title: contact?.name ?? `Lead WhatsApp +${phone}`,
              source: "WhatsApp Direto",
              temperature: "warm",
              ai_status: "qualifying",
            })
            .select("id")
            .single();
          dealId = deal?.id ?? null;
        }
      }
    }

    if (dealId && !conversation.deal_id) {
      await admin
        .from("whatsapp_conversations")
        .update({ deal_id: dealId })
        .eq("id", conversation.id)
        .eq("organization_id", organizationId);
    }
  }

  // ---------- Mensagem (idempotente por provider_message_id) ----------
  const preview = msg.content ?? `[${msg.messageType}]`;

  // Idempotência: ignora mensagens já processadas
  if (msg.providerMessageId) {
    const { data: existing } = await admin
      .from("whatsapp_messages")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("conversation_id", conversation.id)
      .eq("provider_message_id", msg.providerMessageId)
      .maybeSingle();
    if (existing) return NextResponse.json({ ok: true, duplicate: true });
  }

  await admin.from("whatsapp_messages").insert({
    organization_id: organizationId,
    conversation_id: conversation.id,
    provider_message_id: msg.providerMessageId,
    direction: msg.fromMe ? "outbound" : "inbound",
    message_type: msg.messageType,
    content: msg.content,
    media_url: msg.mediaUrl,
    sender_phone: msg.fromMe ? null : phone,
    receiver_phone: msg.fromMe ? phone : null,
    raw_payload: payload,
  });

  await admin
    .from("whatsapp_conversations")
    .update({
      last_message: preview.slice(0, 300),
      last_message_at: new Date().toISOString(),
      status: conversation.status === "resolved" ? "open" : conversation.status,
      unread_count: msg.fromMe ? conversation.unread_count : (conversation.unread_count ?? 0) + 1,
      name: conversation.name ?? msg.senderName ?? null,
    })
    .eq("id", conversation.id)
    .eq("organization_id", organizationId);

  if (dealId && !msg.fromMe) {
    await admin.from("activity_logs").insert({
      organization_id: organizationId,
      deal_id: dealId,
      contact_id: contact?.id ?? null,
      type: "whatsapp_inbound",
      title: "Mensagem WhatsApp recebida",
      description: preview.slice(0, 200),
    });
  }

  return NextResponse.json({ ok: true });
}
