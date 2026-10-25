// Run: node tests/test_strategy.mjs
import assert from "node:assert/strict";
import { sma, rsi, logBands } from "../js/indicators.js";
import { buildSeries, withPriceZones, evaluate, thresholds, project, mining, reportCard, MINERS, DEFAULT_SETTINGS, trendRate, projectTrends, daysToGoal } from "../js/strategy.js";

let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log("PASS", name); };

test("sma", () => {
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
});
test("rsi extremes", () => {
  const up = Array.from({ length: 30 }, (_, i) => i + 1);
  assert.equal(rsi(up).at(-1), 100);
  const down = up.slice().reverse();
  assert.ok(rsi(down).at(-1) < 1);
});
test("log bands bracket a constant series", () => {
  const b = logBands(new Array(100).fill(5), 90, 1);
  assert.ok(Math.abs(b.lo.at(-1) - 5) < 1e-9 && Math.abs(b.hi.at(-1) - 5) < 1e-9);
});

// Synthetic market: 260 days, KAS path supplied, BTC flat, ratio RSI controlled via KAS path
function market(kasPath, fng = 50) {
  const t = kasPath.map((_, i) => 1700000000 + i * 86400);
  return { t, kas: kasPath, btc: kasPath.map(() => 80000), fng: { value: fng, label: "x" } };
}
const flat = new Array(260).fill(0.04);
const run = (kas, fng, settings) => {
  const m = market(kas, fng);
  const s = settings || { ...DEFAULT_SETTINGS, kasUnits: 100000, btcUnits: 0.05 };
  const series = withPriceZones(buildSeries(m), thresholds(s));
  return evaluate(m, series, s);
};

test("neutral market -> neutral signal, regular split", () => {
  const wiggle = flat.map((v, i) => v * (1 + 0.01 * Math.sin(i)));
  const r = run(wiggle, 50);
  assert.equal(r.key, "neutral");
  assert.equal(Math.round(r.buy.kas), 67);
});
test("crash -> buy zone, KAS cheap vs BTC -> all to KAS", () => {
  const crash = flat.slice(0, 230).concat(Array.from({ length: 30 }, (_, i) => 0.04 * 0.985 ** i));
  const r = run(crash, 50, { ...DEFAULT_SETTINGS, kasUnits: 0, btcUnits: 0, extraBuyUsd: 50 });
  assert.equal(r.key, "buy");
  assert.equal(r.buy.kas, 100);
  assert.equal(r.buy.extra, 50);
});
test("rally + extreme greed -> trim zone, KAS rich -> all to BTC", () => {
  const rally = flat.slice(0, 220).concat(Array.from({ length: 40 }, (_, i) => 0.04 * 1.02 ** i));
  const r = run(rally, 80, { ...DEFAULT_SETTINGS, kasUnits: 0, btcUnits: 0 });
  assert.equal(r.key, "trim");
  assert.equal(r.buy.kas, 0);
});
test("greed only -> greed warning", () => {
  const wiggle = flat.map((v, i) => v * (1 + 0.01 * Math.sin(i)));
  assert.equal(run(wiggle, 80).key, "greed");
});
test("conservative profile tilts only half", () => {
  const crash = flat.slice(0, 230).concat(Array.from({ length: 30 }, (_, i) => 0.04 * 0.985 ** i));
  const r = run(crash, 50, { ...DEFAULT_SETTINGS, profile: "conservative" });
  assert.equal(Math.round(r.buy.kas), 84);   // 67 + 33/2
});
test("rebalancing overrides the tilt when outside the band", () => {
  const wiggle = flat.map((v, i) => v * (1 + 0.01 * Math.sin(i)));
  // 1,000,000 KAS at ~$0.04 = $40k vs 0.01 BTC = $800 -> ~98% KAS, target 60%
  const r = run(wiggle, 50, { ...DEFAULT_SETTINGS, kasUnits: 1000000, btcUnits: 0.01 });
  assert.equal(r.buy.kas, 0);
  assert.equal(r.rebalance.heavy, "KAS");
  assert.ok(r.rebalance.sellUsd > 15000 && r.rebalance.sellUsd < 16000);
});
test("projection: flat scenario adds contributions", () => {
  const s = { ...DEFAULT_SETTINGS, kasUnits: 0, btcUnits: 0, dcaUsd: 100, dcaDays: 14 };
  const p = project(s, 0.04, 80000, Date.now() + 140 * 86400000);
  assert.equal(p[0].invested, 1000);
});
test("mining: KS5 on today's network is ~93 KAS/day", () => {
  const r = mining(MINERS[0], 0.15, { hashrateTh: 381000, blockReward: 2.06 }, 0.0358);
  assert.ok(r.kasDay > 90 && r.kasDay < 96, r.kasDay);
  assert.ok(Math.abs(r.breakEven - 0.046) < 0.002, r.breakEven);
});
test("report card runs on synthetic history", () => {
  const path = Array.from({ length: 700 }, (_, i) => 0.04 * (1 + 0.3 * Math.sin(i / 40)));
  const m = market(path);
  const s = { ...DEFAULT_SETTINGS };
  const rc = reportCard(m, withPriceZones(buildSeries(m), thresholds(s)), new Map(), s);
  assert.ok(rc.base.p >= 0 && rc.base.p <= 1);
  assert.equal(rc.tiltRows.length, 3);
});
test("trendRate: doubling over 2 years is ~41%/yr", () => {
  const day = 86400, n = 731;
  const closes = Array.from({ length: n }, (_, i) => [1700000000 + i * day, Math.pow(2, i / (n - 1))]);
  const r = trendRate(closes, 2);
  assert.ok(Math.abs(r.rate - (Math.SQRT2 - 1)) < 0.01, r.rate);
  assert.equal(r.short, false);
});
test("trendRate: shorter history is flagged", () => {
  const closes = Array.from({ length: 400 }, (_, i) => [1700000000 + i * 86400, 1 + i / 400]);
  const r = trendRate(closes, 3);
  assert.equal(r.short, true);
  assert.ok(r.years > 1 && r.years < 1.2);
});
test("projectTrends: zero rate just adds contributions", () => {
  const [a, b] = projectTrends([{ value: 1000, rate: 0, dca: 100 }, { value: 500, rate: 0, dca: 0 }], 14, 140);
  assert.equal(a.projected, 2000);
  assert.equal(a.invested, 1000);
  assert.equal(b.projected, 500);
});
test("projectTrends: +100%/yr doubles in a year", () => {
  const [a] = projectTrends([{ value: 1000, rate: 1, dca: 0 }], 14, 365);
  assert.ok(Math.abs(a.projected - 2000) < 1, a.projected);
});
test("daysToGoal: contributions alone reach the goal on schedule", () => {
  assert.equal(daysToGoal([{ value: 0, rate: 0, dca: 100 }], 14, 1000), 140);
  assert.equal(daysToGoal([{ value: 5000, rate: 0, dca: 0 }], 14, 1000), 0);
  assert.equal(daysToGoal([{ value: 100, rate: -0.5, dca: 0 }], 14, 1000, 3650), null);
});
console.log(`\n${pass} tests passed`);
