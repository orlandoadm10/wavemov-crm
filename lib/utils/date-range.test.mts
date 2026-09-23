/**
 * Intervalos dos filtros de data do Kanban. Asserções em instantes UTC
 * absolutos e processo fixado em UTC — o ambiente da Vercel, onde um
 * `setHours(0)` recortaria o dia às 21h de Brasília.
 */
process.env.TZ = "UTC";

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  customRangeError,
  describeDateRange,
  encodeDateRange,
  parseDateRange,
  resolveDateRange,
  type DateRangePreset,
} from "./period.ts";

/** Quarta, 23/09/2026 às 22:30 BRT (já é 24/09 em UTC). */
const QUARTA_NOITE = new Date("2026-09-24T01:30:00.000Z");

const preset = (p: DateRangePreset, now = QUARTA_NOITE) =>
  resolveDateRange({ kind: "preset", preset: p }, now);
const iso = (r: { from: Date; to: Date }) => [r.from.toISOString(), r.to.toISOString()];

test("Hoje é o dia civil de São Paulo, não o dia UTC", () => {
  assert.deepEqual(iso(preset("hoje")), ["2026-09-23T03:00:00.000Z", "2026-09-24T02:59:59.999Z"]);
  assert.equal(preset("hoje").fromDay, "2026-09-23");
  assert.equal(preset("hoje").toDay, "2026-09-23");
});

test("Ontem é o dia inteiro anterior", () => {
  assert.deepEqual(iso(preset("ontem")), ["2026-09-22T03:00:00.000Z", "2026-09-23T02:59:59.999Z"]);
});

test("Esta semana vai de segunda a domingo", () => {
  const r = preset("semana");
  assert.equal(r.fromDay, "2026-09-21"); // segunda
  assert.equal(r.toDay, "2026-09-27"); // domingo
  // Num domingo, a semana ainda é a que começou na segunda anterior.
  const domingo = preset("semana", new Date("2026-09-27T15:00:00.000Z"));
  assert.equal(domingo.fromDay, "2026-09-21");
  // Na segunda, começa uma nova.
  const segunda = preset("semana", new Date("2026-09-28T04:00:00.000Z"));
  assert.equal(segunda.fromDay, "2026-09-28");
});

test("Este mês e Mês anterior cobrem os meses inteiros", () => {
  assert.deepEqual([preset("mes").fromDay, preset("mes").toDay], ["2026-09-01", "2026-09-30"]);
  assert.deepEqual(
    [preset("mes_anterior").fromDay, preset("mes_anterior").toDay],
    ["2026-08-01", "2026-08-31"]
  );
  assert.equal(preset("mes").to.toISOString(), "2026-10-01T02:59:59.999Z");
});

test("Últimos N dias incluem hoje e têm N dias civis", () => {
  assert.equal(preset("7d").fromDay, "2026-09-17");
  assert.equal(preset("15d").fromDay, "2026-09-09");
  assert.equal(preset("30d").fromDay, "2026-08-25");
  for (const p of ["7d", "15d", "30d"] as const) assert.equal(preset(p).toDay, "2026-09-23");
});

test("mudança de mês: Ontem no dia 1 é o último dia do mês anterior", () => {
  const primeiro = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(preset("ontem", primeiro).fromDay, "2026-09-30");
  assert.equal(preset("7d", primeiro).fromDay, "2026-09-25");
});

test("virada de ano: Mês anterior em janeiro é dezembro do ano anterior", () => {
  const janeiro = new Date("2027-01-01T12:00:00.000Z");
  assert.deepEqual(
    [preset("mes_anterior", janeiro).fromDay, preset("mes_anterior", janeiro).toDay],
    ["2026-12-01", "2026-12-31"]
  );
  assert.equal(preset("ontem", janeiro).fromDay, "2026-12-31");
  // Semana que atravessa o ano: 01/01/2027 é sexta.
  assert.deepEqual(
    [preset("semana", janeiro).fromDay, preset("semana", janeiro).toDay],
    ["2026-12-28", "2027-01-03"]
  );
});

test("personalizado inclui o dia inicial e o final inteiros", () => {
  const r = resolveDateRange({ kind: "custom", from: "2026-09-10", to: "2026-09-15" });
  assert.deepEqual(iso(r), ["2026-09-10T03:00:00.000Z", "2026-09-16T02:59:59.999Z"]);
});

test("personalizado com a mesma data inicial e final é um dia inteiro", () => {
  const r = resolveDateRange({ kind: "custom", from: "2026-09-10", to: "2026-09-10" });
  assert.deepEqual(iso(r), ["2026-09-10T03:00:00.000Z", "2026-09-11T02:59:59.999Z"]);
});

test("intervalo personalizado inválido é recusado", () => {
  assert.equal(customRangeError("", "2026-09-10") !== null, true);
  assert.equal(customRangeError("2026-09-15", "2026-09-10") !== null, true);
  assert.equal(customRangeError("2026-02-30", "2026-03-01") !== null, true);
  assert.equal(customRangeError("2026-09-10", "2026-09-10"), null);
});

test("a URL só aceita valores conhecidos", () => {
  assert.deepEqual(parseDateRange("hoje"), { kind: "preset", preset: "hoje" });
  assert.deepEqual(parseDateRange("2026-09-10_2026-09-15"), {
    kind: "custom",
    from: "2026-09-10",
    to: "2026-09-15",
  });
  for (const lixo of ["personalizado", "amanha", "2026-09-15_2026-09-10", "2026-09-10", "a_b_c", "", null]) {
    assert.equal(parseDateRange(lixo), null, String(lixo));
  }
  const v = { kind: "custom", from: "2026-09-10", to: "2026-09-15" } as const;
  assert.deepEqual(parseDateRange(encodeDateRange(v)), v);
  assert.equal(describeDateRange(v), "10/09/2026 – 15/09/2026");
  assert.equal(describeDateRange({ kind: "preset", preset: "7d" }), "Últimos 7 dias");
});
