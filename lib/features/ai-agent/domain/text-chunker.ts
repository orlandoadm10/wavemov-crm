// ============================================================
// Divide o material da base de conhecimento em trechos para embedding.
//
// Parágrafo primeiro; parágrafo grande demais é partido por frase; cada
// trecho carrega o final do anterior (sobreposição) para que uma resposta que
// atravessa a fronteira ainda seja encontrada. Puro e testável.
// ============================================================

export interface ChunkOptions {
  /** Tamanho máximo de um trecho, em caracteres. */
  maxChars?: number;
  /** Quanto do trecho anterior entra no começo do próximo. */
  overlapChars?: number;
}

export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? 1200;
  const overlapChars = Math.min(opts.overlapChars ?? 150, Math.floor(maxChars / 2));

  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const segments: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) {
      segments.push(paragraph);
      continue;
    }
    let current = "";
    for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
      if (sentence.length > maxChars) {
        // Frase gigante sem pontuação: corta no tamanho, sem perder nada.
        if (current) segments.push(current);
        current = "";
        for (let i = 0; i < sentence.length; i += maxChars) segments.push(sentence.slice(i, i + maxChars));
        continue;
      }
      const candidate = current ? `${current} ${sentence}` : sentence;
      if (candidate.length > maxChars) {
        segments.push(current);
        current = sentence;
      } else {
        current = candidate;
      }
    }
    if (current) segments.push(current);
  }

  // Junta segmentos pequenos vizinhos (FAQ de uma linha por parágrafo) para
  // não gerar centenas de trechos de 40 caracteres.
  const merged: string[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.length + segment.length + 2 <= maxChars) {
      merged[merged.length - 1] = `${last}\n\n${segment}`;
    } else {
      merged.push(segment);
    }
  }

  return merged.map((chunk, i) => {
    if (i === 0 || overlapChars === 0) return chunk;
    const previous = merged[i - 1];
    const tail = previous.slice(-overlapChars);
    return `${tail}\n${chunk}`;
  });
}
