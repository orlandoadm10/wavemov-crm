/**
 * Tradução do que as fontes de lead entregam.
 *
 *   npm run test:unit
 *
 * Os payloads do Typeform seguem o formato documentado do webhook
 * (`form_response.answers` + `definition.fields`). O que estes testes prendem
 * é o que faria o lead chegar sem nome ou sem telefone: tipo de resposta não
 * lido, pergunta perdida, corpo urlencoded ignorado.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  flattenPayload,
  parseGenericPayload,
  parseRequestBody,
  parseTypeformPayload,
} from "./inbound-payload.ts";

const typeformBody = {
  event_id: "01HEVENT",
  event_type: "form_response",
  form_response: {
    form_id: "lT4Z3j",
    token: "a3a12ec67a1365927098a606107fac15",
    hidden: { utm_source: "facebook", utm_campaign: "" },
    calculated: { score: 0 },
    definition: {
      fields: [
        { id: "f1", title: "Qual é o seu *nome*?", ref: "nome_ref", type: "short_text" },
        { id: "f2", title: "Seu e-mail", type: "email" },
        { id: "f3", title: "WhatsApp com DDD", type: "phone_number" },
        { id: "f4", title: "Quantas vidas, {{field:f1}}?", type: "multiple_choice" },
        { id: "f5", title: "Quais produtos?", type: "multiple_choice" },
        { id: "f6", title: "Possui CNPJ?", type: "yes_no" },
      ],
    },
    answers: [
      { type: "text", text: "Ana Souza", field: { id: "f1", ref: "nome_ref", type: "short_text" } },
      { type: "email", email: "ana@exemplo.com", field: { id: "f2", type: "email" } },
      { type: "phone_number", phone_number: "+5584999990000", field: { id: "f3", type: "phone_number" } },
      { type: "choice", choice: { label: "2 a 4" }, field: { id: "f4", type: "multiple_choice" } },
      { type: "choices", choices: { labels: ["Saúde", "Odonto"], other: "Vida" }, field: { id: "f5" } },
      { type: "boolean", boolean: false, field: { id: "f6", type: "yes_no" } },
    ],
  },
};

test("Typeform: toda resposta vira campo, com a pergunta como rótulo", () => {
  const parsed = parseTypeformPayload(typeformBody);
  assert.ok(parsed);
  assert.equal(parsed.eventKey, "a3a12ec67a1365927098a606107fac15");
  assert.deepEqual(parsed.fields, [
    { key: "nome_ref", label: "Qual é o seu nome?", value: "Ana Souza" },
    { key: "f2", label: "Seu e-mail", value: "ana@exemplo.com" },
    { key: "f3", label: "WhatsApp com DDD", value: "+5584999990000" },
    { key: "f4", label: "Quantas vidas, …?", value: "2 a 4" },
    { key: "f5", label: "Quais produtos?", value: "Saúde, Odonto, Vida" },
    { key: "f6", label: "Possui CNPJ?", value: "Não" },
    { key: "utm_source", label: "utm_source", value: "facebook" },
  ]);
});

test("Typeform: corpo de outra origem não é confundido com Typeform", () => {
  assert.equal(parseTypeformPayload({ name: "Ana" }), null);
  assert.equal(parseTypeformPayload({ form_response: { answers: "x" } }), null);
});

test("corpo JSON, urlencoded e sem content-type", () => {
  assert.deepEqual(parseRequestBody('{"nome":"Ana"}', "application/json"), { nome: "Ana" });
  assert.deepEqual(parseRequestBody("nome=Ana&interesse=a&interesse=b", "application/x-www-form-urlencoded"), {
    nome: "Ana",
    interesse: "a, b",
  });
  // Ferramenta simples que não manda o cabeçalho.
  assert.deepEqual(parseRequestBody("nome=Ana+Souza", null), { nome: "Ana Souza" });
  assert.deepEqual(parseRequestBody('[{"nome":"Ana"}]', "application/json"), { nome: "Ana" });
  assert.equal(parseRequestBody("", "application/json"), null);
  assert.equal(parseRequestBody("{quebrado", "application/json"), null);
  assert.equal(parseRequestBody("texto solto", "text/plain"), null);
});

test("JSON aninhado vira caminho; lista simples vira texto", () => {
  const fields = flattenPayload({
    lead: { nome: "Ana", contato: { telefone: "84 99999-0000" } },
    interesses: ["a", "b"],
    itens: [{ sku: "X" }],
    vazio: "",
    nulo: null,
    ativo: true,
  });
  assert.deepEqual(
    fields.map((f) => [f.key, f.label, f.value]),
    [
      ["lead.nome", "Nome", "Ana"],
      ["lead.contato.telefone", "Telefone", "84 99999-0000"],
      ["interesses", "Interesses", "a, b"],
      ["itens.0.sku", "Sku", "X"],
      ["ativo", "Ativo", "true"],
    ]
  );
});

test("webhook genérico: id do envio pelas chaves comuns, ou nenhum", () => {
  assert.equal(parseGenericPayload({ event_id: "e1", id: "x" }).eventKey, "e1");
  assert.equal(parseGenericPayload({ id: 42 }).eventKey, "42");
  assert.equal(parseGenericPayload({ nome: "Ana" }).eventKey, null);
});

test("teto de campos e de tamanho do valor", () => {
  const body = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`c${i}`, "x".repeat(3000)]));
  const fields = flattenPayload(body);
  assert.equal(fields.length, 100);
  assert.equal(fields[0].value.length, 2000);
});
