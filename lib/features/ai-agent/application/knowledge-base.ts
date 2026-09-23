// ============================================================
// Base de conhecimento (RAG): indexar material e buscar trechos.
//
// Indexar = dividir em trechos, gerar embeddings e gravar em
// `knowledge_chunks` (service_role — `authenticated` não escreve ali).
// Buscar = embedding da pergunta + `match_knowledge_chunks`, que recebe a
// organização como parâmetro e só é executável pelo servidor (0026).
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkText } from "../domain/text-chunker";
import { embedTexts, toPgVector } from "../infrastructure/embeddings";

export interface KnowledgeHit {
  documentId: string;
  title: string;
  content: string;
  similarity: number;
}

/** Abaixo disso o trecho é ruído: responder com ele é pior que não ter nada. */
const MIN_SIMILARITY = 0.25;
const EMBED_BATCH = 64;

export async function indexKnowledgeDocument(
  admin: SupabaseClient,
  organizationId: string,
  documentId: string
): Promise<{ ok: true; chunks: number } | { ok: false; error: string }> {
  const { data: doc } = await admin
    .from("knowledge_documents")
    .select("id, title, content")
    .eq("id", documentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!doc) return { ok: false, error: "Documento não encontrado." };

  await admin
    .from("knowledge_documents")
    .update({ status: "indexing", error: null })
    .eq("id", documentId)
    .eq("organization_id", organizationId);

  try {
    // O título entra em cada trecho: "Horário" sozinho não diz de quê.
    const chunks = chunkText(doc.content).map((c) => `${doc.title}\n${c}`);
    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      vectors.push(...(await embedTexts(chunks.slice(i, i + EMBED_BATCH))));
    }

    // Reindexar substitui o material anterior deste documento.
    const { error: deleteError } = await admin
      .from("knowledge_chunks")
      .delete()
      .eq("document_id", documentId)
      .eq("organization_id", organizationId);
    if (deleteError) throw new Error("Falha ao limpar os trechos anteriores.");

    if (chunks.length > 0) {
      const { error: insertError } = await admin.from("knowledge_chunks").insert(
        chunks.map((content, index) => ({
          organization_id: organizationId,
          document_id: documentId,
          chunk_index: index,
          content,
          embedding: toPgVector(vectors[index]),
        }))
      );
      if (insertError) throw new Error(`Falha ao gravar os trechos: ${insertError.message}`);
    }

    await admin
      .from("knowledge_documents")
      .update({
        status: "ready",
        chunk_count: chunks.length,
        indexed_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", documentId)
      .eq("organization_id", organizationId);
    return { ok: true, chunks: chunks.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("knowledge_documents")
      .update({ status: "error", error: message.slice(0, 500) })
      .eq("id", documentId)
      .eq("organization_id", organizationId);
    return { ok: false, error: message };
  }
}

export async function searchKnowledge(
  admin: SupabaseClient,
  args: { organizationId: string; query: string; agentId?: string | null; limit?: number }
): Promise<KnowledgeHit[]> {
  const query = args.query.trim();
  if (!query) return [];
  const [vector] = await embedTexts([query.slice(0, 2000)]);
  const { data, error } = await admin.rpc("match_knowledge_chunks", {
    p_organization_id: args.organizationId,
    p_query_embedding: toPgVector(vector),
    p_match_count: args.limit ?? 5,
    p_agent_id: args.agentId ?? null,
  });
  if (error) throw new Error(`Falha na busca da base de conhecimento: ${error.message}`);
  return ((data ?? []) as { document_id: string; title: string; content: string; similarity: number }[])
    .filter((row) => row.similarity >= MIN_SIMILARITY)
    .map((row) => ({
      documentId: row.document_id,
      title: row.title,
      content: row.content,
      similarity: Number(row.similarity.toFixed(3)),
    }));
}
