// ============================================================
// Adaptador da API oficial do WhatsApp (Meta Cloud API).
//
// USO EXCLUSIVO NO SERVIDOR. O token de acesso da instância vive em
// `whatsapp_instances.token_encrypted` e nunca sai daqui; o segredo do app
// (`META_APP_SECRET`) só assina/valida o webhook.
//
// A Meta só aceita texto livre dentro da janela de 24h desde a última
// mensagem do contato. Fora dela, apenas template aprovado — quem chama
// decide, este módulo só devolve o erro com código reconhecível.
// ============================================================
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NormalizedInboundMessage } from "@/lib/services/uazapi";

export interface MetaCloudConfig {
  accessToken: string;
  phoneNumberId: string;
}

export interface MetaSendResult {
  ok: boolean;
  providerMessageId: string | null;
  /** Código de erro da Graph API, quando houver (ex.: 131047 = fora da janela). */
  errorCode: number | null;
  errorMessage: string | null;
  raw: unknown;
}

export interface MetaStatusUpdate {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
}

export interface MetaWebhookBatch {
  phoneNumberId: string;
  messages: NormalizedInboundMessage[];
  statuses: MetaStatusUpdate[];
  /** Objeto `value` original da mudança, guardado como raw_payload. */
  raw: Record<string, unknown>;
}

/** Erro da Meta que significa "janela de 24h fechada: use template". */
export const META_WINDOW_CLOSED_CODES = new Set([131047, 470]);

function graphBase() {
  const version = process.env.META_GRAPH_VERSION?.trim() || "v21.0";
  return `https://graph.facebook.com/${version}`;
}

async function postMessage(config: MetaCloudConfig, body: Record<string, unknown>): Promise<MetaSendResult> {
  try {
    const res = await fetch(`${graphBase()}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...body }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as {
      messages?: { id?: string }[];
      error?: { code?: number; message?: string };
    } | null;
    return {
      ok: res.ok && Boolean(data?.messages?.[0]?.id),
      providerMessageId: data?.messages?.[0]?.id ?? null,
      errorCode: data?.error?.code ?? null,
      errorMessage: data?.error?.message ?? (res.ok ? null : `HTTP ${res.status}`),
      raw: data,
    };
  } catch (err) {
    return {
      ok: false,
      providerMessageId: null,
      errorCode: null,
      errorMessage: err instanceof Error ? err.message : String(err),
      raw: null,
    };
  }
}

export function sendMetaText(config: MetaCloudConfig, to: string, text: string) {
  return postMessage(config, {
    to,
    type: "text",
    text: { body: text, preview_url: false },
  });
}

export function sendMetaTemplate(
  config: MetaCloudConfig,
  to: string,
  template: { name: string; language: string; bodyParams: string[] }
) {
  return postMessage(config, {
    to,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      components:
        template.bodyParams.length > 0
          ? [
              {
                type: "body",
                parameters: template.bodyParams.map((text) => ({ type: "text", text })),
              },
            ]
          : [],
    },
  });
}

/**
 * Confere o `X-Hub-Signature-256` sobre o corpo CRU. Sem `META_APP_SECRET`
 * a função recusa tudo: aceitar webhook sem assinatura seria abrir a porta
 * para qualquer um gravar mensagens em qualquer empresa.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

type MetaMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string; id?: string };
  video?: { caption?: string; id?: string };
  document?: { caption?: string; filename?: string; id?: string };
  audio?: { id?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  location?: { latitude?: number; longitude?: number; name?: string };
};

function normalizeMetaMessage(
  message: MetaMessage,
  contactName: string | null,
  displayPhone: string | null
): NormalizedInboundMessage | null {
  const from = String(message.from ?? "").replace(/\D/g, "");
  if (!from) return null;

  let messageType: NormalizedInboundMessage["messageType"] = "text";
  let content: string | null = null;
  switch (message.type) {
    case "text":
      content = message.text?.body ?? null;
      break;
    case "image":
      messageType = "image";
      content = message.image?.caption ?? null;
      break;
    case "video":
      messageType = "video";
      content = message.video?.caption ?? null;
      break;
    case "audio":
      messageType = "audio";
      break;
    case "document":
      messageType = "document";
      content = message.document?.caption ?? message.document?.filename ?? null;
      break;
    case "button":
      content = message.button?.text ?? null;
      break;
    case "interactive":
      content =
        message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? null;
      break;
    case "location":
      content = message.location
        ? `📍 ${message.location.name ?? ""} ${message.location.latitude},${message.location.longitude}`.trim()
        : null;
      break;
    default:
      content = message.type ? `[${message.type}]` : null;
  }

  return {
    providerMessageId: message.id ?? null,
    fromPhone: from,
    toPhone: displayPhone ? displayPhone.replace(/\D/g, "") : null,
    senderName: contactName,
    messageType,
    content,
    // Mídia da Meta exige download autenticado pelo id; o id fica no raw.
    mediaUrl: null,
    fromMe: false,
    timestamp: message.timestamp ? Number(message.timestamp) : null,
  };
}

/** Achata o envelope `entry[].changes[].value` num lote por número. */
export function parseMetaWebhook(payload: unknown): MetaWebhookBatch[] {
  const batches: MetaWebhookBatch[] = [];
  const entries = (payload as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return batches;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { field?: string; value?: Record<string, unknown> }).value;
      if (!value || (change as { field?: string }).field !== "messages") continue;
      const metadata = value.metadata as { phone_number_id?: string; display_phone_number?: string } | undefined;
      const phoneNumberId = metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const contacts = (value.contacts ?? []) as { wa_id?: string; profile?: { name?: string } }[];
      const nameOf = (waId?: string) =>
        contacts.find((c) => c.wa_id === waId)?.profile?.name ?? null;

      const messages = ((value.messages ?? []) as MetaMessage[])
        .map((m) => normalizeMetaMessage(m, nameOf(m.from), metadata?.display_phone_number ?? null))
        .filter((m): m is NormalizedInboundMessage => m !== null);

      const statuses = ((value.statuses ?? []) as { id?: string; status?: string }[])
        .filter(
          (s): s is { id: string; status: MetaStatusUpdate["status"] } =>
            typeof s.id === "string" &&
            ["sent", "delivered", "read", "failed"].includes(String(s.status))
        )
        .map((s) => ({ providerMessageId: s.id, status: s.status }));

      batches.push({ phoneNumberId, messages, statuses, raw: value });
    }
  }
  return batches;
}
