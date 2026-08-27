/**
 * Tolerancia do contrato de ingestao a lixo de integracao.
 *
 * Origens reais mandam `null` no campo opcional que o lead nao preencheu, e o
 * Meta manda estruturas aninhadas. Com o schema estrito, um unico
 * `"email": null` derrubava a requisicao inteira com 400 — o n8n reentregava,
 * tomava 400 de novo, e o lead se perdia.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { externalLeadIngestSchema } from "./index.ts";

const base = { form_external_id: "xtehq3ca", event_id: "evt-1" };

test("null em campo opcional nao derruba o lead", () => {
  const r = externalLeadIngestSchema.safeParse({
    ...base,
    data: { name: "Lead", email: null, phone: "+5584999915326" },
  });
  assert.equal(r.success, true);
  assert.deepEqual(r.data!.data, { name: "Lead", phone: "+5584999915326" });
});

test("estrutura aninhada do Meta e descartada, o resto entra", () => {
  const r = externalLeadIngestSchema.safeParse({
    ...base,
    data: { name: "Lead", field_data: [{ name: "x", values: ["y"] }] },
  });
  assert.equal(r.success, true);
  assert.deepEqual(r.data!.data, { name: "Lead" });
});

test("metadata com null e objeto tambem sobrevive", () => {
  const r = externalLeadIngestSchema.safeParse({
    ...base,
    data: { name: "Lead" },
    metadata: { r_lista: "P: v", utm: null, extra: { a: 1 } },
  });
  assert.equal(r.success, true);
  assert.deepEqual(r.data!.metadata, { r_lista: "P: v" });
});

test("numero e booleano continuam virando texto", () => {
  const r = externalLeadIngestSchema.safeParse({
    ...base,
    data: { vidas: 4, ativo: true },
  });
  assert.equal(r.success, true);
  assert.deepEqual(r.data!.data, { vidas: "4", ativo: "true" });
});

test("o que ainda deve ser 400", () => {
  // Contrato quebrado de verdade: sem id, sem evento, ou `data` que nem e objeto.
  assert.equal(externalLeadIngestSchema.safeParse({ ...base }).success, false);
  assert.equal(
    externalLeadIngestSchema.safeParse({ ...base, data: "texto solto" }).success,
    false
  );
  assert.equal(
    externalLeadIngestSchema.safeParse({ form_external_id: "ab", event_id: "1", data: {} }).success,
    false,
    "external_id fora do formato"
  );
});
