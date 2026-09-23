/**
 * O nome do lead nunca vem de mensagem enviada pela equipe, e um nome real só
 * substitui placeholder. Caso real: 37 leads da JID chamados "Orlando Lima".
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isPlaceholderName, leadNameFromMessage } from "./lead-name.ts";

test("mensagem enviada pela equipe (fromMe) não dá nome ao lead", () => {
  assert.equal(leadNameFromMessage({ fromMe: true, senderName: "Orlando Lima" }), null);
});

test("mensagem do lead dá o nome dele, sem espaços nas pontas", () => {
  assert.equal(leadNameFromMessage({ fromMe: false, senderName: "  Caio Carvalho " }), "Caio Carvalho");
});

test("nome vazio é ausência de nome", () => {
  assert.equal(leadNameFromMessage({ fromMe: false, senderName: "" }), null);
  assert.equal(leadNameFromMessage({ fromMe: false, senderName: "   " }), null);
  assert.equal(leadNameFromMessage({ fromMe: false, senderName: null }), null);
});

test("placeholders reconhecidos", () => {
  for (const nome of [null, "", "  ", "WhatsApp +5584999990000", "Lead WhatsApp +5584999990000", "+5584999990000", "84 99999-0000"]) {
    assert.equal(isPlaceholderName(nome), true, String(nome));
  }
});

test("nome digitado pela equipe não é placeholder", () => {
  for (const nome of ["Orlando Lima", "Açai House", "Jessica Gomes💫", "RICARDO"]) {
    assert.equal(isPlaceholderName(nome), false, nome);
  }
});
