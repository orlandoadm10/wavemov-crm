/**
 * As bordas do período e as chaves do eixo vivem no fuso do negócio
 * (`America/Sao_Paulo`), não no do processo.
 *
 * Estes testes existem porque o defeito é invisível na máquina do
 * desenvolvedor: em BRT tudo bate, e só o deploy (Node em UTC) mostra o lead
 * das 22h contando no total e sumindo do gráfico. Por isso as asserções são
 * absolutas — instantes UTC explícitos.
 *
 * O `TZ = UTC` abaixo não é detalhe: em BRT o `startOfDay` do date-fns produz
 * exatamente o mesmo resultado dos helpers com fuso, então um retrocesso para
 * a implementação antiga passaria verde justamente onde `npm run test:unit` é
 * rodado. Fixar o fuso faz o teste vigiar o ambiente que importa — a Vercel.
 */
process.env.TZ = "UTC";

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addZonedDays,
  dailySeries,
  endOfZonedDay,
  resolvePeriod,
  startOfZonedDay,
  zonedDayKey,
  zonedDayRange,
} from "./period.ts";

/** 27/08/2026 às 22:00 BRT — o horário que revela o bug. */
const NOITE_BRT = new Date("2026-08-28T01:00:00.000Z");

test("um instante depois das 21h UTC pertence ao dia anterior em São Paulo", () => {
  assert.equal(zonedDayKey(NOITE_BRT), "2026-08-27");
});

test("o dia civil de São Paulo começa às 03:00 UTC e termina às 02:59:59.999", () => {
  assert.equal(startOfZonedDay(NOITE_BRT).toISOString(), "2026-08-27T03:00:00.000Z");
  assert.equal(endOfZonedDay(NOITE_BRT).toISOString(), "2026-08-28T02:59:59.999Z");
});

test("periodo=hoje recorta o dia brasileiro, não o dia UTC", () => {
  const period = resolvePeriod("hoje", NOITE_BRT);
  assert.equal(period.from.toISOString(), "2026-08-27T03:00:00.000Z");
  assert.equal(period.to.toISOString(), "2026-08-28T02:59:59.999Z");
  assert.equal(period.days, 1);
  // O lead das 22h BRT está dentro do recorte...
  assert.ok(NOITE_BRT >= period.from && NOITE_BRT <= period.to);
});

test("o eixo do gráfico cobre o mesmo dia que o recorte conta", () => {
  const period = resolvePeriod("hoje", NOITE_BRT);
  const axis = zonedDayRange(period.from, period.to);
  assert.deepEqual(axis, [{ day: "2026-08-27", label: "27/08" }]);
  // Esta é a igualdade que o relatório de tags quebrava: a chave do eixo
  // precisa ser a mesma que a RPC devolve em `bucket_start`.
  assert.equal(axis[0].day, zonedDayKey(NOITE_BRT));
});

test("periodo=7d cobre sete dias civis, do primeiro ao último", () => {
  const period = resolvePeriod("7d", NOITE_BRT);
  assert.equal(period.from.toISOString(), "2026-08-21T03:00:00.000Z");
  assert.equal(period.days, 7);
  const axis = zonedDayRange(period.from, period.to);
  assert.equal(axis.length, 7);
  assert.equal(axis[0].day, "2026-08-21");
  assert.equal(axis[6].day, "2026-08-27");
});

test("periodo=mes vai do dia 1 até hoje, contando os dias decorridos", () => {
  const period = resolvePeriod("mes", NOITE_BRT);
  assert.equal(period.from.toISOString(), "2026-08-01T03:00:00.000Z");
  assert.equal(period.to.toISOString(), "2026-08-28T02:59:59.999Z");
  assert.equal(period.days, 27);
});

test("periodo=mes não estoura o fim do mês em uma virada", () => {
  // 31/12/2026 às 23:00 BRT.
  const reveillon = new Date("2027-01-01T02:00:00.000Z");
  const period = resolvePeriod("mes", reveillon);
  assert.equal(period.from.toISOString(), "2026-12-01T03:00:00.000Z");
  assert.equal(period.to.toISOString(), "2027-01-01T02:59:59.999Z");
  assert.equal(period.days, 31);
});

test("addZonedDays atravessa a virada do mês pelo calendário civil", () => {
  assert.equal(zonedDayKey(addZonedDays(NOITE_BRT, 5)), "2026-09-01");
  assert.equal(zonedDayKey(addZonedDays(NOITE_BRT, -27)), "2026-07-31");
});

test("dailySeries conta o lead da noite no dia brasileiro", () => {
  const period = resolvePeriod("7d", NOITE_BRT);
  const series = dailySeries([NOITE_BRT], period.from, period.to);
  assert.equal(series.length, 7);
  const dia27 = series.find((point) => point.day === "2026-08-27");
  assert.equal(dia27?.total, 1);
  assert.equal(series.reduce((sum, point) => sum + point.total, 0), 1);
});

test("dailySeries ignora datas fora do intervalo em vez de somá-las na borda", () => {
  const period = resolvePeriod("hoje", NOITE_BRT);
  const series = dailySeries(
    [NOITE_BRT, new Date("2026-08-20T12:00:00.000Z")],
    period.from,
    period.to
  );
  assert.equal(series.reduce((sum, point) => sum + point.total, 0), 1);
});

test("eixo com intervalo invertido volta vazio em vez de inventar um dia", () => {
  assert.deepEqual(zonedDayRange(new Date("2026-08-28T12:00:00.000Z"), new Date("2026-08-01T12:00:00.000Z")), []);
});

test("eixo absurdamente longo falha alto em vez de truncar em silêncio", () => {
  assert.throws(
    () => zonedDayRange(new Date("2024-01-01T12:00:00.000Z"), new Date("2026-01-01T12:00:00.000Z")),
    /maior que 400 dias/
  );
});

test("o fuso do processo está fixado — sem isso o teste não vigia a produção", () => {
  assert.equal(process.env.TZ, "UTC");
  // Prova de que o fuso realmente pegou: em UTC o dia local vira no 00:00Z.
  assert.equal(new Date("2026-08-28T01:00:00.000Z").getDate(), 28);
  // ...enquanto o dia do NEGÓCIO ainda é 27.
  assert.equal(zonedDayKey(new Date("2026-08-28T01:00:00.000Z")), "2026-08-27");
});
