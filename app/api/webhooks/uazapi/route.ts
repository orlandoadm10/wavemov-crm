import { scheduleInboundFollowUp } from "@/lib/features/whatsapp-inbound/application/after-inbound";
import { ingestInboundMessage } from "@/lib/features/whatsapp-inbound/application/ingest-inbound-message";
import { extractInstanceRefs, normalizeWebhookMessage } from "@/lib/services/uazapi";
import { secretsMatch } from "@/lib/services/webhook-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// O turno da IA roda em `after()` na mesma invocação.
export const maxDuration = 60;

// ============================================================
// POST /api/webhooks/uazapi?org=<organization_id>&secret=<segredo>
//
// Recebe mensagens da UAZAPI:
// 1. Autentica pelo segredo da instância (whatsapp_instances.webhook_secret)
// 2. Normaliza o payload (formatos variam entre versões)
// 3. Registra contato, conversa, lead, mensagem e histórico
//    (lib/features/whatsapp-inbound — mesma regra do webhook da Meta)
// 4. Depois da resposta: turno do agente de IA e fila de automações
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
    // O segredo de uma instância da Meta (0027) é verify token de outra rota.
    .neq("provider", "meta_cloud")
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

  // Contato, conversa, lead, mensagem e histórico: regra única, compartilhada
  // com o webhook da Meta (ver `ingestInboundMessage`).
  const result = await ingestInboundMessage(admin, {
    organizationId,
    instanceId,
    message: msg,
    rawPayload: payload,
  });
  if (result.status === "error") {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });
  }

  // IA e automações rodam DEPOIS da resposta: a UAZAPI não espera o turno do
  // agente, e um timeout aqui a faria reenviar a mensagem.
  scheduleInboundFollowUp(organizationId, result);

  return NextResponse.json({ ok: true, duplicate: result.status === "duplicate" || undefined });
}
