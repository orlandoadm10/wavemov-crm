/**
 * Faixa de indicadores do pipeline.
 *
 *   npm run test:unit
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { pipelineMetrics, type MetricDealRow } from "./pipeline-metrics.ts";

const start = new Date("2026-09-01T03:00:00Z");
const row = (over: Partial<MetricDealRow>): MetricDealRow => ({
  status: "open",
  value: 0,
  created_at: "2026-09-10T12:00:00Z",
  won_at: null,
  ...over,
});

test("quadro: contagem, soma e ticket saem das negociações exibidas", () => {
  const m = pipelineMetrics([{ value: "1000" }, { value: 3000 }], [], start);
  assert.equal(m.opportunities, 2);
  assert.equal(m.pipelineValue, 4000);
  assert.equal(m.averageTicket, 2000);
  assert.equal(m.conversion, null);
});

test("mês: venda conta pela data da venda; conversão pelas criadas no mês", () => {
  const m = pipelineMetrics(
    [],
    [
      row({ status: "won", value: 500, created_at: "2026-08-20T12:00:00Z", won_at: "2026-09-02T12:00:00Z" }),
      row({ status: "won", value: 700, won_at: "2026-09-15T12:00:00Z" }),
      row({}),
      row({ status: "lost" }),
      row({ status: "won", value: 900, created_at: "2026-07-01T12:00:00Z", won_at: "2026-08-30T12:00:00Z" }),
    ],
    start
  );
  assert.equal(m.wonCount, 2);
  assert.equal(m.wonValue, 1200);
  assert.equal(m.conversion, 33.3);
});

test("quadro vazio não divide por zero", () => {
  assert.equal(pipelineMetrics([], [], start).averageTicket, 0);
});
