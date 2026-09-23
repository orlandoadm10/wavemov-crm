// ============================================================
// Embeddings da base de conhecimento — o MESMO modelo na indexação e na
// busca. Divergir quebra o recall em silêncio (vetores deixam de ser
// comparáveis), então a dimensão é conferida a cada chamada.
//
// Configuração própria (AI_EMBEDDING_*) porque nem todo provedor de chat
// oferece embeddings (a OpenRouter, por exemplo, não). Sem ela, cai na
// configuração de chat.
// USO EXCLUSIVO NO SERVIDOR.
// ============================================================

export const EMBEDDING_DIMENSIONS = 1536;

function embeddingConfig() {
  const apiKey =
    process.env.AI_EMBEDDING_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseUrl = (
    process.env.AI_EMBEDDING_BASE_URL ||
    process.env.AI_BASE_URL ||
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small";
  return { apiKey, baseUrl, model };
}

export function isEmbeddingConfigured() {
  return Boolean(embeddingConfig().apiKey);
}

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  const { apiKey, baseUrl, model } = embeddingConfig();
  if (!apiKey) {
    throw new Error("Base de conhecimento sem chave de embeddings: defina AI_EMBEDDING_API_KEY ou AI_API_KEY.");
  }
  if (inputs.length === 0) return [];

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: inputs, dimensions: EMBEDDING_DIMENSIONS }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as {
    data?: { embedding: number[]; index: number }[];
    error?: { message?: string };
  } | null;
  if (!res.ok || !data?.data) {
    throw new Error(`Falha ao gerar embeddings (${res.status}): ${data?.error?.message ?? "sem detalhe"}`);
  }

  const vectors = [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  for (const v of vectors) {
    if (v.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding com ${v.length} dimensões, esperado ${EMBEDDING_DIMENSIONS} — o recall quebraria em silêncio.`
      );
    }
  }
  return vectors;
}

/** Formato literal aceito pelo pgvector via PostgREST: "[0.1,0.2,...]". */
export function toPgVector(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
