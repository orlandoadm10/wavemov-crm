// ============================================================
// Adaptador UAZAPI — camada de serviço para WhatsApp
//
// A API exata da UAZAPI pode variar entre versões/planos, então
// este adaptador centraliza endpoints e normaliza payloads.
// Configuração via variáveis de ambiente ou por instância (banco).
// USO EXCLUSIVO NO SERVIDOR (route handlers / server actions).
// ============================================================

// A UAZAPI identifica a instância unicamente pelo token — não existe um
// "Instance ID" separado para configurar (o id da instância, quando existe,
// é apenas informativo e vem DE volta nas respostas da API, ex.: status()).
export interface UazapiConfig {
  baseUrl: string;
  token: string;
}

export interface UazapiInstanceStatus {
  status: "disconnected" | "connecting" | "qr" | "connected" | "error";
  qrCode?: string | null;
  // Id da instância informado pela própria API (apenas informativo)
  instanceId?: string | null;
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
  if (!baseUrl || !token) return null;
  return { baseUrl, token };
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
  const instanceId: string | null = d?.instance?.id ?? null;

  // Algumas versões da UAZAPI retornam `status` como OBJETO
  // (ex.: { connected: true, loggedIn: true, ... }), não como string.
  // Esse sinal booleano é o mais confiável quando presente.
  if (d?.status && typeof d.status === "object") {
    if (d.status.connected === true || d.status.loggedIn === true) {
      return { status: "connected", instanceId, raw: d };
    }
  }

  // Fallback: status como string, priorizando instance.status (mais estável)
  const rawStatus = String(
    d?.instance?.status ?? (typeof d?.status === "string" ? d.status : "") ?? d?.state ?? ""
  ).toLowerCase();

  if (["connected", "open", "online"].includes(rawStatus)) {
    return { status: "connected", instanceId, raw: d };
  }
  if (["qr", "qrcode", "scan"].includes(rawStatus)) {
    return { status: "qr", qrCode: d?.qrcode ?? d?.qr ?? null, instanceId, raw: d };
  }
  if (["connecting", "loading", "starting"].includes(rawStatus)) {
    return { status: "connecting", instanceId, raw: d };
  }
  return { status: "disconnected", instanceId, raw: d };
}

// ---------------- QR Code ----------------
// Confirmado empiricamente: a UAZAPI não expõe um endpoint GET dedicado de
// QR code — é o próprio POST /instance/connect que devolve o qrcode (dentro
// de `instance.qrcode`) quando a instância ainda não está conectada.
export async function getQrCode(config: UazapiConfig): Promise<string | null> {
  const res = await uazapiFetch(config, `/instance/connect`, { method: "POST" });
  if (!res.ok) return null;
  const d = res.data as Record<string, any> | null;
  const qr = d?.instance?.qrcode ?? d?.qrcode ?? d?.qr ?? d?.base64 ?? null;
  return qr ? String(qr) : null;
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

/**
 * Extrai do payload do webhook as referências plausíveis da instância.
 *
 * Serve para resolver a organização dona da mensagem sem depender do `?org=`
 * da URL. Os nomes variam entre versões da UAZAPI, por isso a lista de chaves —
 * e por isso devolve TODAS as candidatas em vez da primeira: `owner`, por
 * exemplo, é o telefone da instância na UAZAPI, e se parasse nele o token real
 * aninhado nunca seria consultado.
 *
 * A ordem vai da mais específica para a menos: token e apikey identificam a
 * instância sem ambiguidade; `data.id` costuma ser o id da mensagem e só entra
 * como último recurso.
 */
export function extractInstanceRefs(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const nested = (p.instance ?? p.data ?? {}) as Record<string, unknown>;

  const candidates = [
    p.token,
    p.apikey,
    p.apiKey,
    p.instanceId,
    p.instance_id,
    typeof p.instance === "string" ? p.instance : undefined,
    nested.token,
    nested.instanceId,
    nested.instance_id,
    nested.id,
  ];

  const refs: string[] = [];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed && !refs.includes(trimmed)) refs.push(trimmed);
  }
  return refs;
}
