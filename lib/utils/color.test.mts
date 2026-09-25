/**
 * Texto sobre a cor da etapa.
 *
 *   npm run test:unit
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DARK_TEXT, textOnColor } from "./color.ts";

test("etapas escuras ficam com texto branco", () => {
  for (const c of ["#3b82f6", "#8b5cf6", "#ec4899", "#64748b", "#1d4ed8"]) {
    assert.equal(textOnColor(c), "#ffffff", c);
  }
});

test("etapas claras (âmbar, amarelo, ciano) ficam com texto escuro", () => {
  for (const c of ["#f59e0b", "#facc15", "#06b6d4", "#10b981", "#fde68a"]) {
    assert.equal(textOnColor(c), DARK_TEXT, c);
  }
});

test("cor ausente, inválida ou em var() cai no branco", () => {
  assert.equal(textOnColor(null), "#ffffff");
  assert.equal(textOnColor("var(--primary)"), "#ffffff");
  assert.equal(textOnColor("#abc"), DARK_TEXT);
});
