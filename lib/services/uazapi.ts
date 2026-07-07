// ============================================================
// Adaptador UAZAPI — camada de serviço para WhatsApp
//
// A API exata da UAZAPI pode variar entre versões/planos, então
// este adaptador centraliza endpoints e normaliza payloads.
// Configuração via variáveis de ambiente ou por instância (banco).
// USO EXCLUSIVO NO SERVIDOR (route handlers / server actions).
// ============================================================

export interface UazapiConfig {
  baseUrl: string;
  token: string;
  instanceId: string;
}

export interface UazapiInstanceStatus {
  status: "disconnected" | "connecting" | "qr" | "connected" | "error";
  qrCode?: string | null;
  raw?: unknown;
}

export interface NormalizedInboundMessage {
  providerMessageId: string | null;
  fromPhone: string;
  toPhone: string | null;
  senderName: string | null;
  messageType: "text" | "image" | "audio" | "video" | "document" | "system";
  content: string | null;
  mediaUrl: string | null;
  fromMe: boolean;
  timestamp: number | null;
}

// Config padrão via env (fallback quando a instância não tem config própria)
export function getEnvConfig(): UazapiConfig | null {
  const baseUrl = process.env.UAZAPI_BASE_URL;
  const token = process.env.UAZAPI_TOKEN;
  const instanceId = process.env.UAZAPI_INSTANCE_ID;
  if (!baseUrl || !token || !instanceId) return null;
  return { baseUrl, token, instanceId };
}

async function uazapiFetch(
  config: UazapiConfig,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        // UAZAPI usa header "token" (algumas versões aceitam Authorization)
        token: config.token,
        Authorization: `Bearer ${config.token}`,
        ...init?.headers,
      },
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: String(err) } };
  }
}

// ---------------- Status da instância ----------------
export async function getInstanceStatus(
  config: UazapiConfig
): Promise<UazapiInstanceStatus> {
  const res = await uazapiFetch(config, `/instance/status`, { method: "GET" });

  if (!res.ok) return { status: "error", raw: res.data };

  const d = res.data as Record<string, any> | null;
  const rawStatus = String(
    d?.status ?? d?.instance?.status ?? d?.state ?? ""
  ).toLowerCase();

  if (["connected", "open", "online"].includes(rawStatus)) {
    return { status: "connected", raw: d };
  }
  if (["qr", "qrcode", "scan"].includes(rawStatus)) {
    return { status: "qr", qrCode: d?.qrcode ?? d?.qr ?? null, raw: d };
  }
  if (["connecting", "loading", "starting"].includes(rawStatus)) {
    return { status: "connecting", raw: d };
  }
  return { status: "disconnected", raw: d };
}

// ---------------- QR Code ----------------
export async function getQrCode(config: UazapiConfig): Promise<string | null> {
  // Tenta os endpoints mais comuns entre versões da UAZAPI
  for (const path of [`/instance/qrcode`, `/instance/connect`]) {
    const res = await uazapiFetch(config, path, { method: "GET" });
    if (res.ok) {
      const d = res.data as Record<string, any> | null;
      const qr = d?.qrcode ?? d?.qr ?? d?.base64 ?? d?.instance?.qrcode ?? null;
      if (qr) return String(qr);
    }
  }
  return null;
}

// ---------------- Conectar / Reiniciar ----------------
export async function connectInstance(config: UazapiConfig) {
  return uazapiFetch(config, `/instance/connect`, { method: "POST" });
}

export async function disconnectInstance(config: UazapiConfig) {
  return uazapiFetch(config, `/instance/disconnect`, { method: "POST" });
}

export async function restartInstance(config: UazapiConfig) {
  return uazapiFetch(config, `/instance/restart`, { method: "POST" });
}

// ---------------- Envio de mensagem ----------------
export async function sendTextMessage(
  config: UazapiConfig,
  phone: string,
  text: string
): Promise<{ ok: boolean; providerMessageId: string | null; raw: unknown }> {
  const res = await uazapiFetch(config, `/send/text`, {
    method: "POST",
    body: JSON.stringify({ number: phone, text }),
  });

  const d = res.data as Record<string, any> | null;
  return {
    ok: res.ok,
    providerMessageId:
      d?.id ?? d?.messageid ?? d?.key?.id ?? d?.message?.id ?? null,
    raw: d,
  };
}

// ---------------- Normalização de webhook ----------------
// Aceita formatos comuns da UAZAPI/Baileys e devolve estrutura única.
export function normalizeWebhookMessage(
  payload: Record<string, any>
): NormalizedInboundMessage | null {
  // Formatos possíveis: { message: {...} } | { data: { message } } | { data: {...} }
  const msg =
    payload?.message ??
    payload?.data?.message ??
    payload?.data ??
    payload;

  if (!msg || typeof msg !== "object") return null;

  const fromMe = Boolean(msg.fromMe ?? msg.fromme ?? msg.key?.fromMe ?? false);

  const rawJid: string =
    msg.chatid ?? msg.chatId ?? msg.from ?? msg.sender ?? msg.key?.remoteJid ?? "";
  const phone = String(rawJid).replace(/\D/g, "");
  if (!phone) return null;

  // Ignora grupos
  if (String(rawJid).includes("@g.us")) return null;

  const content: string | null =
    msg.text ??
    msg.body ??
    msg.conversation ??
    msg.message?.conversation ??
    msg.message?.extendedTextMessage?.text ??
    msg.caption ??
    null;

  let messageType: NormalizedInboundMessage["messageType"] = "text";
  const rawType = String(msg.messageType ?? msg.type ?? "text").toLowerCase();
  if (rawType.includes("image")) messageType = "image";
  else if (rawType.includes("audio") || rawType.includes("ptt")) messageType = "audio";
  else if (rawType.includes("video")) messageType = "video";
  else if (rawType.includes("document")) messageType = "document";

  return {
    providerMessageId: msg.id ?? msg.messageid ?? msg.key?.id ?? null,
    fromPhone: phone,
    toPhone: msg.to ? String(msg.to).replace(/\D/g, "") : null,
    senderName: msg.senderName ?? msg.pushName ?? msg.notifyName ?? null,
    messageType,
    content: content ? String(content) : null,
    mediaUrl: msg.mediaUrl ?? msg.media_url ?? msg.fileUrl ?? null,
    fromMe,
    timestamp: msg.messageTimestamp ?? msg.timestamp ?? null,
  };
}
