/**
 * Números do Dashboard.
 *
 *   npm run test:unit
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignStats, monthlySeries, NO_CAMPAIGN, sellerRanking, stageFunnel, type MetricDeal } from "./dashboard-metrics.ts";

const deal = (over: Partial<MetricDeal>): MetricDeal => ({
  status: "open",
  value: 0,
  created_at: "2026-09-10T12:00:00Z",
  won_at: null,
  source: null,
  utm_source: null,
  utm_campaign: null,
  responsible_id: null,
  stage_id: "s1",
  ...over,
});

test("ranking: só quem vendeu, pelo valor; conversão sobre as negociações do vendedor", () => {
  const rows = sellerRanking([
    deal({ responsible_id: "ana", status: "won", value: "1000" }),
    deal({ responsible_id: "ana", status: "open" }),
    deal({ responsible_id: "ana", status: "lost" }),
    deal({ responsible_id: "bia", status: "won", value: 3000 }),
    deal({ responsible_id: "caio", status: "open" }),
    deal({ responsible_id: null, status: "won", value: 9999 }),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.id, r.wonCount, r.wonValue, r.ticket, Math.round(r.conversion)]),
    [
      ["bia", 1, 3000, 3000, 100],
      ["ana", 1, 1000, 1000, 33],
    ]
  );
});

test("campanhas: campanha, senão UTM, senão origem, senão entrada manual", () => {
  const rows = campaignStats([
    deal({ utm_campaign: "Black Friday", status: "won", value: 500 }),
    deal({ utm_campaign: "Black Friday", status: "lost" }),
    deal({ utm_source: "google" }),
    deal({ source: "Typeform: Plano" }),
    deal({}),
  ]);
  assert.deepEqual(rows[0], { name: "Black Friday", leads: 2, won: 1, lost: 1, conversion: 50, wonValue: 500 });
  assert.deepEqual(rows.map((r) => r.name).sort(), ["Black Friday", NO_CAMPAIGN, "Typeform: Plano", "google"].sort());
});

test("funil: só abertas, na ordem das etapas, largura relativa à maior", () => {
  const rows = stageFunnel(
    [
      deal({ stage_id: "a", value: 100 }),
      deal({ stage_id: "a" }),
      deal({ stage_id: "b", value: 50 }),
      deal({ stage_id: "b", status: "won" }),
    ],
    [
      { id: "b", name: "B", color: "#f00", order_index: 2 },
      { id: "a", name: "A", color: "#00f", order_index: 1 },
      { id: "w", name: "Ganho", color: "#0f0", order_index: 3, is_won_stage: true },
    ]
  );
  assert.deepEqual(
    rows.map((r) => [r.id, r.count, r.value, r.share]),
    [
      ["a", 2, 100, 100],
      ["b", 1, 50, 50],
    ]
  );
});

test("séries mensais: leads por criação, vendas por data da venda", () => {
  const points = monthlySeries(
    [
      deal({ created_at: "2026-08-05T00:00:00Z", status: "won", won_at: "2026-09-02T00:00:00Z", value: 200 }),
      deal({ created_at: "2026-08-20T00:00:00Z" }),
      deal({ created_at: "2026-09-01T00:00:00Z" }),
    ],
    [
      { key: "2026-08", label: "ago" },
      { key: "2026-09", label: "set" },
    ]
  );
  assert.deepEqual(points, [
    { month: "ago", leads: 2, sales: 0, salesValue: 0, conversion: 50 },
    { month: "set", leads: 1, sales: 1, salesValue: 200, conversion: 0 },
  ]);
});
