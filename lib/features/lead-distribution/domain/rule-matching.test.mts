/**
 * Ordem de avaliacao das regras de distribuicao.
 *
 * E a parte que o administrador precisa conseguir prever olhando a tela: se a
 * ordem nao for obvia, ele configura uma campanha e nao entende por que os
 * leads foram para outro lugar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { selectRule, type DistributionRule } from "./rule-matching.ts";

const regra = (over: Partial<DistributionRule>): DistributionRule => ({
  id: "r",
  name: "Regra",
  method: "weighted_round_robin",
  priority: 100,
  is_fallback: false,
  origin: null,
  form_id: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const PADRAO = regra({ id: "padrao", name: "Distribuição padrão", is_fallback: true, priority: 1000 });

test("sem regra nenhuma, ninguem e escolhido", () => {
  assert.equal(selectRule([], { origin: "external_ingest", formId: "f1" }), null);
});

test("so a padrao: ela pega tudo", () => {
  const r = selectRule([PADRAO], { origin: "whatsapp", formId: null });
  assert.equal(r?.id, "padrao");
});

test("condicao de formulario tem de bater", () => {
  const campanha = regra({ id: "campanha", form_id: "f1" });
  assert.equal(selectRule([campanha, PADRAO], { origin: "external_ingest", formId: "f1" })?.id, "campanha");
  assert.equal(selectRule([campanha, PADRAO], { origin: "external_ingest", formId: "f2" })?.id, "padrao");
});

test("condicoes combinam com E", () => {
  const r = regra({ id: "ambas", origin: "external_ingest", form_id: "f1" });
  assert.equal(selectRule([r, PADRAO], { origin: "external_ingest", formId: "f1" })?.id, "ambas");
  // Origem certa, formulario errado: nao casa.
  assert.equal(selectRule([r, PADRAO], { origin: "external_ingest", formId: "f2" })?.id, "padrao");
  // Formulario certo, origem errada: nao casa.
  assert.equal(selectRule([r, PADRAO], { origin: "public_form", formId: "f1" })?.id, "padrao");
});

test("prioridade menor vence", () => {
  const alta = regra({ id: "alta", priority: 1, origin: "external_ingest" });
  const baixa = regra({ id: "baixa", priority: 50, origin: "external_ingest" });
  assert.equal(selectRule([baixa, alta, PADRAO], { origin: "external_ingest", formId: null })?.id, "alta");
});

test("prioridade igual desempata pela mais antiga", () => {
  const antiga = regra({ id: "antiga", created_at: "2026-01-01T00:00:00Z", origin: "whatsapp" });
  const nova = regra({ id: "nova", created_at: "2026-06-01T00:00:00Z", origin: "whatsapp" });
  assert.equal(selectRule([nova, antiga, PADRAO], { origin: "whatsapp", formId: null })?.id, "antiga");
});

test("a padrao e SEMPRE a ultima, mesmo com prioridade baixa", () => {
  // Se ela concorresse por prioridade, salva-la com prioridade 1 engoliria
  // todas as regras especificas e o admin levaria tempo ate desconfiar.
  const padraoGulosa = { ...PADRAO, priority: 1 };
  const campanha = regra({ id: "campanha", priority: 500, form_id: "f1" });
  const r = selectRule([padraoGulosa, campanha], { origin: "external_ingest", formId: "f1" });
  assert.equal(r?.id, "campanha");
});

test("regra especifica que nao casa nao bloqueia a padrao", () => {
  const campanha = regra({ id: "campanha", priority: 1, form_id: "outro" });
  assert.equal(selectRule([campanha, PADRAO], { origin: "whatsapp", formId: null })?.id, "padrao");
});
