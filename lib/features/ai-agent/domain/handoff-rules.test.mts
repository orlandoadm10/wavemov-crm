/**
 * Gatilhos de transferência IA → humano. Cada falso positivo tira da IA uma
 * conversa que ela resolveria; cada falso negativo deixa um lead irritado
 * falando com robô. Os dois lados têm caso aqui.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { inboundHandoffReason, replyHandoffReason, type HandoffPolicy } from "./handoff-rules.ts";

const tudoLigado: HandoffPolicy = { handoffOnRequest: true, handoffOnLegal: true, handoffOnUncertainty: true };
const tudoDesligado: HandoffPolicy = { handoffOnRequest: false, handoffOnLegal: false, handoffOnUncertainty: false };

test("pedido explícito de humano transfere", () => {
  for (const frase of [
    "quero falar com um atendente",
    "Preciso falar com uma pessoa",
    "atendente por favor",
    "não quero falar com robô",
    "vc é um robô?",
    "gostaria de falar com o gerente",
  ]) {
    assert.equal(inboundHandoffReason(frase, tudoLigado), "pedido_humano", frase);
  }
});

test("conversa comum não transfere", () => {
  for (const frase of [
    "quanto custa o plano?",
    "quero saber mais sobre o curso",
    "pode me mandar o endereço",
    "falar sobre o preço",
    "Obrigado!",
  ]) {
    assert.equal(inboundHandoffReason(frase, tudoLigado), null, frase);
  }
});

test("assunto jurídico transfere", () => {
  assert.equal(inboundHandoffReason("vou abrir reclamação no Procon", tudoLigado), "assunto_juridico");
  assert.equal(inboundHandoffReason("meu advogado vai entrar em contato", tudoLigado), "assunto_juridico");
  assert.equal(inboundHandoffReason("vou postar no reclame aqui", tudoLigado), "assunto_juridico");
});

test("gatilho desligado no agente não transfere", () => {
  assert.equal(inboundHandoffReason("quero falar com um atendente", tudoDesligado), null);
  assert.equal(inboundHandoffReason("vou no procon", tudoDesligado), null);
});

test("resposta insegura transfere só quando a política pede", () => {
  const resposta = "Não tenho essa informação agora.";
  assert.equal(replyHandoffReason(resposta, tudoLigado), "incerteza");
  assert.equal(replyHandoffReason(resposta, { ...tudoLigado, handoffOnUncertainty: false }), null);
  assert.equal(replyHandoffReason("O plano custa R$ 100 por mês.", tudoLigado), null);
});

test("texto vazio nunca transfere", () => {
  assert.equal(inboundHandoffReason("", tudoLigado), null);
  assert.equal(replyHandoffReason("", tudoLigado), null);
});
