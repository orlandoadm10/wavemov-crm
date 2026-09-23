/**
 * O motor de automação dispara WhatsApp para cliente real: uma condição que
 * vira "verdadeira por omissão" manda mensagem para quem não devia.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { conditionsMatch, renderTemplate, triggerConfigMatches } from "./rules.ts";

const ctx = {
  deal: { source: "Meta Ads", temperature: "hot", tags: ["google", "VIP"], title: "Plano anual" },
  contact: { name: "Maria Souza", first_name: "Maria", city: "São Paulo" },
  stage: { name: "Proposta" },
};

test("condições em AND", () => {
  assert.equal(conditionsMatch([{ field: "deal.source", op: "eq", value: "meta ads" }], ctx), true);
  assert.equal(
    conditionsMatch(
      [
        { field: "deal.source", op: "eq", value: "Meta Ads" },
        { field: "deal.temperature", op: "eq", value: "cold" },
      ],
      ctx
    ),
    false
  );
});

test("campo ausente nunca é verdadeiro por omissão (só neq passa)", () => {
  assert.equal(conditionsMatch([{ field: "deal.utm_campaign", op: "eq", value: "x" }], ctx), false);
  assert.equal(conditionsMatch([{ field: "deal.utm_campaign", op: "contains", value: "x" }], ctx), false);
  assert.equal(conditionsMatch([{ field: "deal.utm_campaign", op: "neq", value: "x" }], ctx), true);
});

test("contains em texto ignora caixa e acento", () => {
  assert.equal(conditionsMatch([{ field: "contact.city", op: "contains", value: "sao paulo" }], ctx), true);
});

test("contains em lista é pertinência exata, sem caixa", () => {
  assert.equal(conditionsMatch([{ field: "deal.tags", op: "contains", value: "Google" }], ctx), true);
  assert.equal(conditionsMatch([{ field: "deal.tags", op: "contains", value: "goo" }], ctx), false);
});

test("filtro de etapa do gatilho", () => {
  assert.equal(triggerConfigMatches({ stage_id: "s1" }, { payload: { stage_id: "s1" } }), true);
  assert.equal(triggerConfigMatches({ stage_id: "s1" }, { payload: { stage_id: "s2" } }), false);
  assert.equal(triggerConfigMatches({}, { payload: { stage_id: "s2" } }), true);
  assert.equal(triggerConfigMatches({ stage_id: "" }, { payload: { stage_id: "s2" } }), true);
});

test("variáveis da mensagem, com apelidos em português", () => {
  assert.equal(
    renderTemplate("Oi {{contato.nome}}, sua proposta ({{ etapa.nome }}) está pronta!", ctx),
    "Oi Maria, sua proposta (Proposta) está pronta!"
  );
  assert.equal(renderTemplate("{{deal.title}}", ctx), "Plano anual");
});

test("variável desconhecida some, sem vazar {{...}} para o cliente", () => {
  assert.equal(renderTemplate("Oi {{contato.apelido}}!", ctx), "Oi !");
});
