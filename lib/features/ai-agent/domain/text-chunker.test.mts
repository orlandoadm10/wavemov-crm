import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkText } from "./text-chunker.ts";

test("texto curto vira um trecho só", () => {
  assert.deepEqual(chunkText("Horário: 9h às 18h."), ["Horário: 9h às 18h."]);
});

test("texto vazio não gera trecho", () => {
  assert.deepEqual(chunkText("  \n\n  "), []);
});

test("parágrafos pequenos vizinhos são agrupados", () => {
  const faq = Array.from({ length: 10 }, (_, i) => `Pergunta ${i}? Resposta ${i}.`).join("\n\n");
  const chunks = chunkText(faq, { maxChars: 1200, overlapChars: 0 });
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].includes("Pergunta 0") && chunks[0].includes("Pergunta 9"));
});

test("nenhum trecho passa do limite (sem contar a sobreposição)", () => {
  const longo = Array.from({ length: 200 }, (_, i) => `Frase número ${i} do manual.`).join(" ");
  const chunks = chunkText(longo, { maxChars: 300, overlapChars: 0 });
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 300, `trecho com ${c.length}`);
});

test("sobreposição leva o final do trecho anterior", () => {
  const texto = `${"a".repeat(250)}.\n\n${"b".repeat(250)}.`;
  const chunks = chunkText(texto, { maxChars: 260, overlapChars: 20 });
  assert.equal(chunks.length, 2);
  assert.ok(chunks[1].startsWith("a".repeat(19)));
});

test("nenhum conteúdo se perde, nem em frase gigante sem pontuação", () => {
  const gigante = "x".repeat(2500);
  const chunks = chunkText(gigante, { maxChars: 1000, overlapChars: 0 });
  assert.equal(chunks.join("").length, 2500);
});
