/**
 * Estado da fonte de lead na tela.
 *
 *   npm run test:unit
 *
 * Só a falha da ÚLTIMA entrega pinta de vermelho. Fonte quieta ou nova não é
 * alarme — mesma regra da saúde da entrada (alarme falso mata o alarme).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { describeSourceStatus, formatSince } from "./source-status.ts";

const now = new Date("2026-09-25T12:00:00Z");

test("pausada vence tudo", () => {
  assert.deepEqual(describeSourceStatus({ isActive: false, lastEventAt: "2026-09-25T11:00:00Z", lastStatus: "failed", now }), {
    tone: "slate",
    label: "Pausada",
  });
});

test("fonte nova aguarda, sem alarme", () => {
  assert.equal(describeSourceStatus({ isActive: true, lastEventAt: null, lastStatus: null, now }).tone, "amber");
});

test("última entrega com falha é vermelho; duplicada não", () => {
  assert.equal(describeSourceStatus({ isActive: true, lastEventAt: "2026-09-25T11:00:00Z", lastStatus: "failed", now }).tone, "red");
  assert.equal(describeSourceStatus({ isActive: true, lastEventAt: "2026-09-25T11:00:00Z", lastStatus: "duplicate", now }).tone, "green");
});

test("fonte quieta há dias continua verde", () => {
  const status = describeSourceStatus({ isActive: true, lastEventAt: "2026-09-20T12:00:00Z", lastStatus: "processed", now });
  assert.deepEqual(status, { tone: "green", label: "Recebendo · há 5 dias" });
});

test("tempo decorrido legível", () => {
  assert.equal(formatSince("2026-09-25T11:59:30Z", now), "agora há pouco");
  assert.equal(formatSince("2026-09-25T11:15:00Z", now), "há 45 min");
  assert.equal(formatSince("2026-09-25T09:00:00Z", now), "há 3 h");
  assert.equal(formatSince("2026-09-24T11:00:00Z", now), "há 1 dia");
});
