/**
 * Ligação dos campos recebidos com o formulário de destino.
 *
 *   npm run test:unit
 *
 * A promessa ao cliente é "funciona sem mapear nada". Estes testes prendem as
 * duas metades dela: a sugestão acerta nome, e-mail e telefone nas grafias
 * reais, e NÃO confunde "nome da empresa" ou `campaign_name` com o nome do
 * lead — o erro mais caro, porque o card nasceria com o nome da campanha.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ANSWERS_KEY, parseLeadInfo } from "../../lead-ingestion/domain/lead-answers.ts";
import {
  ANSWERS_KEY,
  buildSubmission,
  collectReceivedFields,
  guessIdentity,
  suggestTarget,
  type TargetField,
} from "./field-mapping.ts";

const FORM: TargetField[] = [
  { field_key: "name", label: "Nome", field_type: "text" },
  { field_key: "email", label: "E-mail", field_type: "email" },
  { field_key: "phone", label: "WhatsApp", field_type: "phone" },
];

const f = (key: string, label: string, value: string) => ({ key, label, value });

test("a chave das respostas é a mesma que o card do lead lê", () => {
  assert.equal(ANSWERS_KEY, DEFAULT_ANSWERS_KEY);
});

test("reconhece nome, e-mail e telefone nas grafias reais", () => {
  assert.equal(guessIdentity(f("full_name", "full_name", "Ana Souza")), "name");
  assert.equal(guessIdentity(f("f1", "Qual é o seu nome?", "Ana")), "name");
  assert.equal(guessIdentity(f("x", "Nome completo", "Ana Souza")), "name");
  assert.equal(guessIdentity(f("phone_number", "phone_number", "+5584999990000")), "phone");
  assert.equal(guessIdentity(f("f3", "WhatsApp com DDD", "(84) 99999-0000")), "phone");
  assert.equal(guessIdentity(f("celular", "Celular", "84999990000")), "phone");
  assert.equal(guessIdentity(f("f2", "Seu e-mail", "ana@exemplo.com")), "email");
  // E-mail sem rótulo nenhum é reconhecido pelo valor.
  assert.equal(guessIdentity(f("campo7", "Campo 7", "ana@exemplo.com")), "email");
});

test("não confunde nome de empresa, campanha ou formulário com o nome do lead", () => {
  assert.equal(guessIdentity(f("x", "Nome da empresa", "ACME")), null);
  assert.equal(guessIdentity(f("campaign_name", "campaign_name", "Black Friday")), null);
  assert.equal(guessIdentity(f("form_name", "form_name", "Form 1")), null);
  assert.equal(guessIdentity(f("ad_name", "ad_name", "Criativo 3")), null);
});

test("rótulo de telefone com valor que não é telefone não vira telefone", () => {
  assert.equal(guessIdentity(f("x", "Tem WhatsApp?", "Sim")), null);
  assert.equal(guessIdentity(f("x", "Seu e-mail", "não tenho")), null);
});

test("casamento exato com o campo do formulário vence o palpite", () => {
  const targets = [...FORM, { field_key: "cidade", label: "Cidade", field_type: "text" }];
  assert.equal(suggestTarget(f("cidade", "cidade", "Natal"), targets), "cidade");
  assert.equal(suggestTarget(f("q9", "Cidade", "Natal"), targets), "cidade");
});

test("sem mapear nada, o lead entra com nome, e-mail, telefone e as respostas", () => {
  const { data, metadata } = buildSubmission(
    [
      f("f1", "Qual é o seu nome?", "Ana Souza"),
      f("f2", "Seu e-mail", "ana@exemplo.com"),
      f("f3", "WhatsApp com DDD", "+5584999990000"),
      f("f4", "Quantas vidas: hoje?", "2 a 4"),
      f("f5", "Observações", "linha 1\nlinha 2"),
      f("utm_source", "utm_source", "facebook"),
    ],
    {},
    FORM
  );
  assert.deepEqual(data, { name: "Ana Souza", email: "ana@exemplo.com", phone: "+5584999990000" });
  assert.equal(metadata.utm_source, "facebook");
  const info = parseLeadInfo(metadata);
  assert.deepEqual(info.answers, [
    { question: "Quantas vidas hoje?", answer: "2 a 4" },
    { question: "Observações", answer: "linha 1 linha 2" },
  ]);
});

test("mapeamento explícito vence, junta campos e pode desligar a sugestão", () => {
  const fields = [
    f("first_name", "first_name", "Ana"),
    f("last_name", "last_name", "Souza"),
    f("email", "email", "ana@exemplo.com"),
  ];
  const { data, metadata } = buildSubmission(fields, { first_name: "name", last_name: "name", email: "" }, FORM);
  assert.deepEqual(data, { name: "Ana Souza" });
  assert.match(metadata[ANSWERS_KEY], /email: ana@exemplo.com/);
});

test("a sugestão não sobrescreve: o segundo e-mail vai para as respostas", () => {
  const { data, metadata } = buildSubmission(
    [f("email", "email", "a@x.com"), f("email_2", "E-mail comercial", "b@x.com")],
    {},
    FORM
  );
  assert.equal(data.email, "a@x.com");
  assert.match(metadata[ANSWERS_KEY], /E-mail comercial: b@x.com/);
});

test("mapeamento para campo que não existe mais no formulário é ignorado", () => {
  const { data, metadata } = buildSubmission([f("q1", "Pergunta", "resposta")], { q1: "campo_apagado" }, FORM);
  assert.deepEqual(data, {});
  assert.equal(metadata[ANSWERS_KEY], "Pergunta: resposta");
});

test("destino sem campo de e-mail: o e-mail não se perde", () => {
  const semEmail = FORM.filter((t) => t.field_key !== "email");
  const { data, metadata } = buildSubmission([f("email", "E-mail", "a@x.com")], {}, semEmail);
  assert.deepEqual(data, {});
  assert.match(metadata[ANSWERS_KEY], /a@x.com/);
});

test("campos recebidos: mais recente primeiro, sem repetir, com o destino de hoje", () => {
  const rows = collectReceivedFields(
    [
      [f("nome", "Nome", "Bia"), f("cidade", "Cidade", "Natal")],
      [f("nome", "Nome", "Ana"), f("tel", "Telefone", "84999990000")],
    ],
    { cidade: "" },
    FORM
  );
  assert.deepEqual(
    rows.map((r) => [r.key, r.value, r.target, r.explicit]),
    [
      ["nome", "Bia", "name", false],
      ["cidade", "Natal", null, true],
      ["tel", "84999990000", "phone", false],
    ]
  );
});
