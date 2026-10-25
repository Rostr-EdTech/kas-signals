// Signals, buy plan, rebalancing, report card and goal projections.
// Pure functions: no DOM, no network. Not financial advice.
import { sma, rsi, logBands, last, median } from "./indicators.js";

export const PROFILES = {
  conservative: {
    label: "Conservative",
    note: "Buys dips only when deeply discounted, trims earlier, tilts new money gently.",
    rsiBuy: 25, deepBelow: 30, greedFng: 70, stretchedAbove: 40,
    ratioCheap: 25, ratioRich: 75, tilt: "half", bandPct: 5, trimPct: 10,
  },
  balanced: {
    label: "Balanced",
    note: "The thresholds from the KAS backtest.",
    rsiBuy: 30, deepBelow: 25, greedFng: 75, stretchedAbove: 50,
    ratioCheap: 30, ratioRich: 70, tilt: "all", bandPct: 10, trimPct: 15,
  },
  aggressive: {
    label: "Aggressive",
    note: "Buys dips sooner, lets winners run longer before trimming, wider rebalance band.",
    rsiBuy: 35, deepBelow: 20, greedFng: 80, stretchedAbove: 75,
    ratioCheap: 35, ratioRich: 65, tilt: "all", bandPct: 15, trimPct: 20,
  },
};

export const DEFAULT_SETTINGS = {
  kasUnits: 0,
  btcUnits: 0,
  dcaUsd: 100,
  dcaDays: 14,
  dcaKasPct: 67,
  targetKasPct: 60,
  extraBuyUsd: 0,
  profile: "balanced",
  overrides: {},          // per-threshold edits on top of the profile
  goalUsd: 0,
  goalDate: "",
  holdings: {},           // other tokens: { ETH: 0.5, SOL: 10, ... }
  trendYears: 2,          // lookback for "if recent trends continue"
  horizonYears: 3,        // projection horizon; 0 = use the goal date
};

export function thresholds(settings) {
  const base = PROFILES[settings.profile] || PROFILES.balanced;
  return { ...base, ...(settings.overrides || {}) };
}

export const SIGNALS = {
  buy: { label: "Buy-zone conditions", tone: "buy",
    text: "Oversold or deeply below trend. Historically better-than-average moments to add." },
  neutral: { label: "Neutral", tone: "neutral",
    text: "No edge either way. Stick to your regular plan." },
  greed: { label: "Greed warning", tone: "greed",
    text: "Sentiment or price is stretched. Keep your plan, prepare your profit-taking rules." },
  trim: { label: "Trim-zone conditions", tone: "trim",
    text: "Extreme greed and far above trend. Historically weak periods followed." },
};

// Build all chart/indicator series from aligned daily closes.
export function buildSeries(m) {
  const ratio = m.kas.map((k, i) => (k / m.btc[i]) * 1e8);     // sats
  const kasS200 = sma(m.kas, 200);
  const rb = logBands(ratio, 90, 1);
  return {
    t: m.t,
    price: {
      line: m.kas, sma20: sma(m.kas, 20), sma50: sma(m.kas, 50), sma200: kasS200, rsi: rsi(m.kas),
    },
    ratio: {
      line: ratio, sma20: sma(ratio, 20), sma50: sma(ratio, 50), sma200: sma(ratio, 200), rsi: rsi(ratio),
      zone_lo: rb.lo, zone_hi: rb.hi,
    },
    btcSma200: sma(m.btc, 200),
  };
}

// Price-view zones depend on the profile, so they're added separately.
export function withPriceZones(series, th) {
  const s200 = series.price.sma200;
  series.price.zone_lo = s200.map((v) => (v ? v * (1 - th.deepBelow / 100) : null));
  series.price.zone_hi = s200.map((v) => (v ? v * (1 + th.stretchedAbove / 100) : null));
  return series;
}

export function evaluate(m, series, settings) {
  const th = thresholds(settings);
  const price = last(m.kas), btc = last(m.btc);
  const s200 = last(series.price.sma200), r = last(series.price.rsi);
  const fng = m.fng?.value ?? null;
  const vs200 = s200 ? price / s200 - 1 : 0;
  const ratioRsi = last(series.ratio.rsi);

  const oversold = r < th.rsiBuy;
  const deep = vs200 <= -th.deepBelow / 100;
  const greed = fng != null && fng > th.greedFng;
  const stretched = vs200 >= th.stretchedAbove / 100;
  const reasons = [];
  if (oversold) reasons.push(`RSI ${r.toFixed(0)} is below ${th.rsiBuy} (oversold)`);
  if (deep) reasons.push(`Price is ${pct(vs200)} vs its 200-day average (threshold −${th.deepBelow}%)`);
  if (greed) reasons.push(`Fear & Greed ${fng} is above ${th.greedFng}`);
  if (stretched) reasons.push(`Price is ${pct(vs200)} vs its 200-day average (threshold +${th.stretchedAbove}%)`);
  let key = "neutral";
  if (oversold || deep) key = "buy";
  else if (greed && stretched) key = "trim";
  else if (greed || stretched) key = "greed";
  if (key === "neutral") reasons.push("No buy-zone or trim-zone condition is met");

  // This period's buy: ratio tilt, then rebalancing override
  const dca = settings.dcaUsd;
  let buyKas = (dca * settings.dcaKasPct) / 100, buyBtc = dca - buyKas;
  let buyReason = `KAS/BTC RSI ${ratioRsi.toFixed(0)} is neutral: your regular split`;
  if (ratioRsi < th.ratioCheap) {
    buyKas = th.tilt === "all" ? dca : buyKas + buyBtc / 2;
    buyReason = `KAS/BTC RSI ${ratioRsi.toFixed(0)} is below ${th.ratioCheap}: KAS is cheap vs BTC`;
  } else if (ratioRsi > th.ratioRich) {
    buyKas = th.tilt === "all" ? 0 : buyKas / 2;
    buyReason = `KAS/BTC RSI ${ratioRsi.toFixed(0)} is above ${th.ratioRich}: KAS is expensive vs BTC`;
  }
  buyBtc = dca - buyKas;

  const vk = settings.kasUnits * price, vb = settings.btcUnits * btc, value = vk + vb;
  const kasPct = value ? (100 * vk) / value : null;
  const band = th.bandPct, target = settings.targetKasPct;
  let rebalance = null;
  if (value && Math.abs(kasPct - target) > band) {
    const over = kasPct > target;
    const heavy = over ? "KAS" : "BTC", light = over ? "BTC" : "KAS";
    const tgt = target / 100;
    const need = over ? vk / tgt - value : vb / (1 - tgt) - value;
    const buys = Math.max(1, Math.ceil(need / Math.max(dca, 1)));
    buyKas = over ? 0 : dca; buyBtc = dca - buyKas;
    buyReason = `${heavy} is ${Math.abs(kasPct - target).toFixed(0)} pts overweight: all new money to ${light}`;
    rebalance = {
      heavy, light, buys,
      weeks: Math.round((buys * settings.dcaDays) / 7),
      sellUsd: (Math.abs(kasPct - target) / 100) * value,
    };
  }
  const extra = key === "buy" && settings.extraBuyUsd > 0 ? settings.extraBuyUsd : 0;
  const trim = key === "trim" && vk > 0 ? { pct: th.trimPct, usd: (vk * th.trimPct) / 100 } : null;

  return {
    th, key, signal: SIGNALS[key], reasons, price, btc, fng, fngLabel: m.fng?.label, vs200, rsi: r,
    ratio: last(series.ratio.line), ratioRsi, ratioBand: [last(series.ratio.zone_lo), last(series.ratio.zone_hi)],
    btcUp: btc > last(series.btcSma200),
    buy: { kas: buyKas, btc: buyBtc, reason: buyReason, extra },
    portfolio: { vk, vb, value, kasPct, target, band }, rebalance, trim,
  };
}

const pct = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(0)}%`;

// ---------- Report card: how did these thresholds do on the available history? ----------
function dedupe(flags, gap = 20) {
  const out = [];
  let lastI = -Infinity;
  flags.forEach((f, i) => { if (f && i - lastI > gap) { out.push(i); lastI = i; } });
  return out;
}

export function reportCard(m, series, fngByDay, settings) {
  const th = thresholds(settings);
  const p = series.price.line, s200 = series.price.sma200, r = series.price.rsi;
  const n = p.length;
  const fwdMax = (i, w) => { let mx = -Infinity; for (let k = 1; k <= w && i + k < n; k++) mx = Math.max(mx, p[i + k]); return mx / p[i] - 1; };
  const fwd = (i, d) => (i + d < n ? p[i + d] / p[i] - 1 : null);
  const valid = [];
  for (let i = 200; i < n - 90; i++) valid.push(i);
  const jump = (i) => fwdMax(i, 30) >= 0.3;
  const base = { p: valid.filter(jump).length / valid.length, r90: median(valid.map((i) => fwd(i, 90))) };

  const fngAt = (i) => fngByDay?.get(dayKey(m.t[i]));
  const buyFlags = p.map((v, i) => s200[i] != null && r[i] != null &&
    (r[i] < th.rsiBuy || v / s200[i] - 1 <= -th.deepBelow / 100));
  const greedFlags = p.map((v, i) => s200[i] != null &&
    ((fngAt(i) ?? 0) > th.greedFng || v / s200[i] - 1 >= th.stretchedAbove / 100));
  const stats = (flags) => {
    const ev = dedupe(flags).filter((i) => i >= 200 && i < n - 90);
    return { n: ev.length, p: ev.length ? ev.filter(jump).length / ev.length : null, r90: median(ev.map((i) => fwd(i, 90))) };
  };

  // DCA tilt vs fixed split, same money, using the user's plan
  const tilt = (useTilt, from, to) => {
    let uk = 0, ub = 0, inv = 0;
    const ratioR = series.ratio.rsi, kas = m.kas, btc = m.btc;
    for (let i = from; i < to; i += settings.dcaDays) {
      let wk = settings.dcaKasPct / 100;
      if (useTilt && ratioR[i] != null) {
        if (ratioR[i] < th.ratioCheap) wk = th.tilt === "all" ? 1 : wk + (1 - wk) / 2;
        else if (ratioR[i] > th.ratioRich) wk = th.tilt === "all" ? 0 : wk / 2;
      }
      uk += (100 * wk) / kas[i]; ub += (100 * (1 - wk)) / btc[i]; inv += 100;
    }
    return (uk * kas[to - 1] + ub * btc[to - 1]) / inv;
  };
  const mid = Math.floor((200 + n) / 2);
  const tiltRows = [["Full period", 200, n], ["1st half", 200, mid], ["2nd half", mid, n]].map(([name, a, b]) => ({
    name, fixed: tilt(false, a, b), tilt: tilt(true, a, b),
  }));
  return { base, buy: stats(buyFlags), greed: stats(greedFlags), tiltRows, from: m.t[200], to: m.t[n - 1] };
}

export const dayKey = (ts) => Math.floor(ts / 86400);

// ---------- Goal projection: deterministic scenarios, compounding daily, buying every dcaDays ----------
export const SCENARIOS = [
  { name: "Bear", kas: -0.25, btc: -0.10 },
  { name: "Flat", kas: 0.0, btc: 0.05 },
  { name: "Moderate", kas: 0.30, btc: 0.15 },
  { name: "Strong", kas: 0.64, btc: 0.30 },
];

export function project(settings, price, btc, untilMs, nowMs = Date.now()) {
  const days = Math.max(0, Math.round((untilMs - nowMs) / 86400000));
  return SCENARIOS.map((s) => {
    let vk = settings.kasUnits * price, vb = settings.btcUnits * btc, invested = 0;
    const gk = Math.pow(1 + s.kas, 1 / 365), gb = Math.pow(1 + s.btc, 1 / 365);
    const wk = settings.dcaKasPct / 100;
    for (let d = 1; d <= days; d++) {
      vk *= gk; vb *= gb;
      if (d % settings.dcaDays === 0) { vk += settings.dcaUsd * wk; vb += settings.dcaUsd * (1 - wk); invested += settings.dcaUsd; }
    }
    return { ...s, value: vk + vb, invested, days };
  });
}

// ---------- "If recent trends continue" ----------
const YEAR_S = 365.25 * 86400;

// Annualized growth over the last `years` of [[timestamp, close], ...] (sorted).
// Uses all available data when the history is shorter, and says so.
export function trendRate(closes, years) {
  if (!closes?.length) return null;
  const [t1, p1] = closes.at(-1);
  let i = closes.findIndex(([ts]) => ts >= t1 - years * YEAR_S);
  if (i < 0) i = 0;
  const [t0, p0] = closes[i];
  const span = (t1 - t0) / YEAR_S;
  if (span < 0.25 || !(p0 > 0)) return null;
  return { rate: Math.pow(p1 / p0, 1 / span) - 1, years: span, short: span < years - 0.05 };
}

// rows: [{ value, rate, dca }] where dca is USD added on every regular buy (KAS and BTC only)
export function projectTrends(rows, dcaDays, days) {
  return rows.map((r) => {
    const g = Math.pow(1 + r.rate, 1 / 365);
    let v = r.value, invested = 0;
    for (let d = 1; d <= days; d++) {
      v *= g;
      if (r.dca && d % dcaDays === 0) { v += r.dca; invested += r.dca; }
    }
    return { ...r, projected: v, invested };
  });
}

// First day the total reaches `goal` at these rates, or null within maxDays
export function daysToGoal(rows, dcaDays, goal, maxDays = 36500) {
  const vals = rows.map((r) => r.value), g = rows.map((r) => Math.pow(1 + r.rate, 1 / 365));
  if (vals.reduce((a, b) => a + b, 0) >= goal) return 0;
  for (let d = 1; d <= maxDays; d++) {
    let total = 0;
    for (let k = 0; k < rows.length; k++) {
      vals[k] *= g[k];
      if (rows[k].dca && d % dcaDays === 0) vals[k] += rows[k].dca;
      total += vals[k];
    }
    if (total >= goal) return d;
  }
  return null;
}

// ---------- Mining ----------
export const MINERS = [
  { name: "Antminer KS5 (20 TH/s, 3,000 W)", th: 20, w: 3000 },
  { name: "Antminer KS5 Pro (21 TH/s, 3,150 W)", th: 21, w: 3150 },
  { name: "Antminer KS7 (40 TH/s, 3,080 W)", th: 40, w: 3080 },
  { name: "IceRiver KS7 (30 TH/s, 3,500 W)", th: 30, w: 3500 },
  { name: "IceRiver KS7 Lite (4.2 TH/s, 500 W)", th: 4.2, w: 500 },
];

export function mining(miner, kwhPrice, net, price) {
  if (!net?.hashrateTh || !net?.blockReward) return null;
  const emission = net.blockReward * 10 * 86400;                // KAS/day at 10 blocks per second
  const kasDay = (miner.th / net.hashrateTh) * emission;
  const usdDay = kasDay * price;
  const kwhDay = (miner.w / 1000) * 24;
  return { kasDay, usdDay, costDay: kwhDay * kwhPrice, profitDay: usdDay - kwhDay * kwhPrice,
           breakEven: usdDay / kwhDay, blocksPerDay: (miner.th / net.hashrateTh) * 864000 };
}
