// ============================================================
// Cliente de modelo de linguagem — API compatível com OpenAI Chat Completions.
//
// Um formato só atende OpenAI, OpenRouter (que roteia para Claude, Gemini,
// Llama…), Azure OpenAI compatível, Groq, Together, etc.: basta trocar
// `AI_BASE_URL`. Sem SDK — é um POST com tool calling, e uma dependência a
// mais não compraria nada aqui.
//
// USO EXCLUSIVO NO SERVIDOR. A chave nunca vai para o navegador.
// ============================================================

export interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ChatToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatCompletionResult {
  content: string | null;
  toolCalls: ChatToolCall[];
  promptTokens: number;
  completionTokens: number;
  model: string;
}

export class LlmNotConfiguredError extends Error {
  readonly code = "llm_not_configured";
  constructor() {
    super("IA sem chave configurada: defina AI_API_KEY (ou OPENAI_API_KEY) no servidor.");
  }
}

export function llmConfig() {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const defaultModel = process.env.AI_DEFAULT_MODEL || "gpt-4o-mini";
  return { apiKey, baseUrl, defaultModel };
}

export function isLlmConfigured() {
  return Boolean(llmConfig().apiKey);
}

export async function createChatCompletion(args: {
  model?: string;
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  /** Força JSON como resposta (extração estruturada). */
  jsonMode?: boolean;
  timeoutMs?: number;
}): Promise<ChatCompletionResult> {
  const { apiKey, baseUrl, defaultModel } = llmConfig();
  if (!apiKey) throw new LlmNotConfiguredError();

  const model = args.model || defaultModel;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 45_000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Identificação exigida/aproveitada pela OpenRouter; ignorada pela OpenAI.
        "X-Title": "CRM JID Midia",
      },
      body: JSON.stringify({
        model,
        messages: args.messages,
        temperature: args.temperature ?? 0.4,
        max_tokens: args.maxTokens ?? 800,
        ...(args.tools && args.tools.length > 0 ? { tools: args.tools, tool_choice: "auto" } : {}),
        ...(args.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string | null; tool_calls?: ChatToolCall[] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
      error?: { message?: string };
    } | null;

    if (!res.ok || !data?.choices?.[0]) {
      throw new Error(`Modelo recusou a chamada (${res.status}): ${data?.error?.message ?? "sem detalhe"}`);
    }

    const message = data.choices[0].message ?? {};
    return {
      content: message.content ?? null,
      toolCalls: message.tool_calls ?? [],
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      model: data.model ?? model,
    };
  } finally {
    clearTimeout(timer);
  }
}
