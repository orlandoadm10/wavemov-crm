// ============================================================
// Porta única de envio por canal. Nenhuma feature fala com UAZAPI ou Meta
// diretamente: pede aqui, pelo provider da instância da conversa.
//
// Fail-closed: provider desconhecido não cai num padrão — enviar pelo canal
// errado é pior do que não enviar.
// USO EXCLUSIVO NO SERVIDOR.
// ============================================================
import { sendTextMessage } from "@/lib/services/uazapi";
import { resolveConfig } from "@/lib/services/whatsapp";
import type { WhatsAppInstance } from "@/types";
import { META_WINDOW_CLOSED_CODES, sendMetaTemplate, sendMetaText } from "./meta-cloud";

export type ChannelSendErrorCode =
  | "not_configured"
  | "window_closed"
  | "provider_error"
  | "unknown_provider";

export type ChannelSendResult =
  | { ok: true; providerMessageId: string | null; raw: unknown }
  | { ok: false; code: ChannelSendErrorCode; error: string };

export interface TemplateMessage {
  name: string;
  language: string;
  bodyParams: string[];
}

function metaConfig(instance: WhatsAppInstance | null) {
  if (!instance?.token_encrypted || !instance.phone_number_id) return null;
  return { accessToken: instance.token_encrypted, phoneNumberId: instance.phone_number_id };
}

export function providerOf(instance: WhatsAppInstance | null): string {
  return instance?.provider ?? "uazapi";
}

export async function sendChannelText(
  instance: WhatsAppInstance | null,
  phone: string,
  text: string
): Promise<ChannelSendResult> {
  const provider = providerOf(instance);

  if (provider === "uazapi") {
    const config = resolveConfig(instance);
    if (!config) {
      return { ok: false, code: "not_configured", error: "WhatsApp não configurado. Acesse Atendimento → Configurações." };
    }
    const result = await sendTextMessage(config, phone, text);
    if (!result.ok) {
      return { ok: false, code: "provider_error", error: "Falha ao enviar pela UAZAPI. Verifique a conexão da instância." };
    }
    return { ok: true, providerMessageId: result.providerMessageId, raw: result.raw };
  }

  if (provider === "meta_cloud") {
    const config = metaConfig(instance);
    if (!config) {
      return { ok: false, code: "not_configured", error: "API oficial da Meta sem token ou Phone Number ID." };
    }
    const result = await sendMetaText(config, phone, text);
    if (!result.ok) {
      if (result.errorCode !== null && META_WINDOW_CLOSED_CODES.has(result.errorCode)) {
        return {
          ok: false,
          code: "window_closed",
          error: "Janela de 24h fechada: a Meta só permite template aprovado para este contato.",
        };
      }
      return { ok: false, code: "provider_error", error: `Meta recusou o envio: ${result.errorMessage ?? "erro desconhecido"}.` };
    }
    return { ok: true, providerMessageId: result.providerMessageId, raw: result.raw };
  }

  return { ok: false, code: "unknown_provider", error: `Canal desconhecido: ${provider}.` };
}

export async function sendChannelTemplate(
  instance: WhatsAppInstance | null,
  phone: string,
  template: TemplateMessage
): Promise<ChannelSendResult> {
  if (providerOf(instance) !== "meta_cloud") {
    return { ok: false, code: "unknown_provider", error: "Templates só existem na API oficial da Meta." };
  }
  const config = metaConfig(instance);
  if (!config) {
    return { ok: false, code: "not_configured", error: "API oficial da Meta sem token ou Phone Number ID." };
  }
  const result = await sendMetaTemplate(config, phone, template);
  if (!result.ok) {
    return { ok: false, code: "provider_error", error: `Meta recusou o template: ${result.errorMessage ?? "erro desconhecido"}.` };
  }
  return { ok: true, providerMessageId: result.providerMessageId, raw: result.raw };
}
