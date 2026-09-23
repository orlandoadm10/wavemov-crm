/**
 * Regra da senha nova e o destino depois do link do e-mail.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { newPasswordError, safeInternalPath } from "./password-policy.ts";

test("senha válida passa", () => {
  assert.equal(newPasswordError("Segura#2026", "Segura#2026"), null);
});

test("curta, com espaço nas pontas, longa demais ou sem confirmação é recusada", () => {
  assert.notEqual(newPasswordError("curta", "curta"), null);
  assert.notEqual(newPasswordError(" Segura#2026", " Segura#2026"), null);
  assert.notEqual(newPasswordError("a".repeat(73), "a".repeat(73)), null);
  // 72 bytes com acento: 36 "é" = 72 bytes, passa; 37 = 74 bytes, não.
  assert.equal(newPasswordError("é".repeat(36), "é".repeat(36)), null);
  assert.notEqual(newPasswordError("é".repeat(37), "é".repeat(37)), null);
  assert.notEqual(newPasswordError("Segura#2026", "Segura#2027"), null);
});

test("depois do link do e-mail só se vai para dentro do CRM", () => {
  assert.equal(safeInternalPath("/redefinir-senha"), "/redefinir-senha");
  for (const fora of ["https://malicioso.com", "//malicioso.com", "/\\malicioso.com", "", null, undefined]) {
    assert.equal(safeInternalPath(fora), "/dashboard", String(fora));
  }
});
