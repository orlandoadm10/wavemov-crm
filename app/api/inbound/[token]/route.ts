import { eventKeyFor, ingestSourceLead } from "@/lib/features/lead-sources/application/ingest-source-lead";
import {
  type InboundPayload,
  parseGenericPayload,
  parseRequestBody,
  parseTypeformPayload,
} from "@/lib/features/lead-sources/domain/inbound-payload";
import {
  findSourceByToken,
  recordSourceEvent,
  type ResolvedLeadSource,
} from "@/lib/features/lead-sources/infrastructure/lead-source-queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// ============================================================
// /api/inbound/<token> — fontes de lead (migration 0032)
//
// A URL que o cliente cola no Typeform, no Elementor, no Make… Uma por fonte.
// O token do caminho É a autenticação: resolve a fonte, que resolve a
// organização e o formulário de destino. O corpo nunca escolhe empresa, funil
// ou etapa.
//
// O segredo vai no caminho, ao contrário de `/api/ingest/leads` (cabeçalho),
// porque é o único lugar que TODA origem consegue carregar — o Typeform não
// deixa configurar cabeçalho. O risco de a URL aparecer em log fica contido
// por ser um token por fonte, trocável e pausável sem afetar as demais.
//
// Respostas:
// - 404 igual para token inexistente e fonte pausada (a URL não vira oráculo);
// - 400 corpo ilegível, 413 corpo grande demais;
// - 200 entregue, duplicada ou recusada por configuração — a entrega fica
//   registrada na tela da fonte e pode ser reprocessada, então reentregar não
//   ajuda ninguém;
// - 500 só quando o CRM falhou ao gravar: aí a origem deve reentregar.
// ============================================================

const MAX_BODY_BYTES = 256 * 1024;

const notFound = () => NextResponse.json({ error: "Conexão não encontrada." }, { status: 404 });

/** Muitas ferramentas testam a URL com GET antes de salvar. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const source = await findSourceByToken(createAdminClient(), token);
  if (!source) return notFound();
  return NextResponse.json({ ok: true, message: "Conexão ativa. Envie os leads por POST para esta URL." });
}

function translate(source: ResolvedLeadSource, body: Record<string, unknown>): InboundPayload | null {
  if (source.provider === "typeform") return parseTypeformPayload(body);
  return parseGenericPayload(body);
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const source = await findSourceByToken(admin, token);
  if (!source) return notFound();

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Corpo da requisição grande demais." }, { status: 413 });
  }

  const contentType = request.headers.get("content-type");
  let body: Record<string, unknown> | null;
  if (contentType?.toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    body = form
      ? Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"))
      : null;
  } else {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Corpo da requisição grande demais." }, { status: 413 });
    }
    body = parseRequestBody(text, contentType);
  }

  const payload = body ? translate(source, body) : null;
  if (!payload) {
    const reason =
      source.provider === "typeform"
        ? "O corpo recebido não é de um webhook do Typeform."
        : "O corpo recebido não é JSON nem formulário (urlencoded).";
    await recordSourceEvent(admin, source, {
      status: "failed",
      eventKey: null,
      fields: [],
      error: reason,
      dealId: null,
      deduplicated: false,
    });
    return NextResponse.json({ error: reason }, { status: 400 });
  }

  const eventKey = eventKeyFor(source, payload.eventKey, payload.fields);
  const outcome = await ingestSourceLead(admin, source, payload.fields, eventKey);

  // A reentrega de algo já processado não gera linha nova: a tela mostraria
  // "duplicado" a cada retentativa da origem, escondendo as entregas reais.
  if (outcome.status !== "duplicate") {
    await recordSourceEvent(admin, source, {
      status: outcome.status,
      eventKey,
      fields: payload.fields,
      error: outcome.error,
      dealId: outcome.dealId,
      deduplicated: outcome.deduplicated,
    });
  }

  if (outcome.transient) {
    return NextResponse.json({ error: "Não foi possível registrar o lead agora." }, { status: 500 });
  }
  // Sem `deal_id` na resposta: a origem não tem sessão no CRM.
  return NextResponse.json({
    ok: outcome.status !== "failed",
    duplicate: outcome.status === "duplicate",
    ...(outcome.error ? { error: outcome.error } : {}),
  });
}
