import { loadMarket, loadPeerHistory, loadMarketCaps } from "./data.js";
import { KASPA, PEERS, TOKENS, SPEC_ROWS, SUMMARY } from "./peers.js";
import { GUIDE } from "./guide.js";
import { qrSvg } from "./qr.js";
import { Chart } from "./chart.js";
import { SITE } from "./config.js";
import {
  PROFILES, DEFAULT_SETTINGS, thresholds, buildSeries, withPriceZones, evaluate,
  reportCard, project, mining, MINERS, trendRate, projectTrends, daysToGoal,
} from "./strategy.js";

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = "kas-signals-settings-v1";
const REFRESH_MS = 30 * 60 * 1000;
const usd = (v, d = 0) => (v == null || !Number.isFinite(v) ? "–"
  : `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const pct = (x, d = 0) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const day = (ts) => new Date(ts * 1000).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const THRESHOLD_FIELDS = [
  ["rsiBuy", "Buy zone: RSI below"],
  ["deepBelow", "Buy zone: % below 200-day"],
  ["greedFng", "Greed: Fear & Greed above"],
  ["stretchedAbove", "Greed: % above 200-day"],
  ["ratioCheap", "Tilt to KAS: KAS/BTC RSI below"],
  ["ratioRich", "Tilt to BTC: KAS/BTC RSI above"],
  ["bandPct", "Rebalance band (± points)"],
  ["trimPct", "Trim size (% of KAS)"],
];

let settings = loadSettings();
let market = null, baseSeries = null;
const embed = new URLSearchParams(location.search).has("embed");
if (embed) document.body.classList.add("embed");

function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch { /* use defaults */ }
  const s = { ...DEFAULT_SETTINGS, ...saved };
  s.overrides = { ...(s.overrides || {}) };
  s.holdings = { ...(s.holdings || {}) };
  return s;
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
}

// ---------- chart toolbar ----------
const chart = new Chart($("chart"), { onView: showView });
const segOn = (sel, btn) => { document.querySelectorAll(`${sel} button`).forEach((b) => b.classList.toggle("on", b === btn)); };
document.querySelectorAll("#mode-seg button").forEach((b) => (b.onclick = () => {
  segOn("#mode-seg", b);
  $("chart-card").classList.toggle("compare", b.dataset.mode === "compare");
  chart.setOpt("mode", b.dataset.mode);
  renderHowto();
  if (b.dataset.mode === "compare") loadCompare();
}));
document.querySelectorAll("#range-seg button").forEach((b) => (b.onclick = () => { segOn("#range-seg", b); chart.setRange(b.dataset.range); }));
$("zoom-in").onclick = () => chart.zoom(1 / 1.5);
$("zoom-out").onclick = () => chart.zoom(1.5);
document.querySelectorAll("[data-opt]").forEach((cb) => (cb.onchange = () => chart.setOpt(cb.dataset.opt, cb.checked)));
$("share").onclick = share;

// Shareable view links: ?view=ratio&range=All&log=1
const q = new URLSearchParams(location.search);
const pressIf = (sel, val) => { const b = document.querySelector(sel.replace("%", val)); if (b) b.click(); };
if (q.get("view")) pressIf('#mode-seg [data-mode="%"]', q.get("view"));
if (q.get("range")) pressIf('#range-seg [data-range="%"]', q.get("range"));
if (q.get("log") === "1") { const cb = document.querySelector('[data-opt="log"]'); cb.checked = true; chart.setOpt("log", true); }
$("refresh").onclick = () => load(true);
$("open-settings").onclick = openSettings;

function showView(v) {
  const yrs = (v.days / 365.25).toFixed(1);
  let msg = `Showing ${day(v.from)} – ${day(v.to)} (${v.days} days, ${yrs} years). Scroll or pinch to zoom, drag to pan.`;
  if (v.shortOf) msg = `${v.shortOf} requested, but KAS price data starts ${day(v.firstTs)} (${(v.totalDays / 365.25).toFixed(1)} years), so all of it is shown. ` + msg;
  $("view-status").textContent = msg;
}

// ---------- data ----------
async function load(force = false) {
  $("updated").textContent = "Loading market data…";
  try {
    market = await loadMarket({ force });
    baseSeries = buildSeries(market);
    rawHist.KAS = market.t.map((ts, i) => [ts, market.kas[i]]);
    rawHist.BTC = market.t.map((ts, i) => [ts, market.btc[i]]);
    if (force) for (const sym of Object.keys(settings.holdings)) delete rawHist[sym];
    $("error").hidden = true;
    render();
    if (chart.opts.mode === "compare") loadCompare(force);
    loadMarketCaps([KASPA.gecko, ...PEERS.map((p) => p.gecko)], { force })
      .then(renderNetworks).catch(() => renderNetworks(null));
    if (kas && donKas != null) { if (!donTouched) donKas = donDefault(); showDonation(); }
    const at = new Date(market.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    $("updated").textContent = `Updated ${at} · prices to ${day(market.t.at(-1))}`;
  } catch (e) {
    $("error").hidden = false;
    $("error").textContent = `Could not load market data (${e.message}). Check your connection and press Refresh.`;
    $("updated").textContent = "";
  }
}

// ---------- rendering ----------
function render() {
  if (!market) return;
  const th = thresholds(settings);
  const series = withPriceZones(baseSeries, th);
  const ev = evaluate(market, series, settings);
  lastEv = ev;
  renderSignal(ev);
  renderPlan(ev);
  renderPortfolio(ev);
  chart.setData(series);
  renderHowto(ev);
  renderReport(series);
  renderGoal(ev);
  renderNetwork(ev);
  renderTrends();
  const others = Object.entries(settings.holdings).filter(([, u]) => u > 0).map(([sym]) => sym);
  $("setup-hint").hidden = embed || settings.kasUnits > 0 || settings.btcUnits > 0 || others.length > 0;
  const missing = others.filter((sym) => !(sym in rawHist));
  if (missing.length) ensureHistory(missing).then(() => { renderPortfolio(); renderTrends(); });
}

function renderSignal(ev) {
  const b = $("signal-badge");
  b.className = `badge ${ev.signal.tone}`;
  b.textContent = ev.signal.label;
  $("signal-text").textContent = ev.signal.text;
  $("signal-reasons").innerHTML = ev.reasons.map((r) => `<li>${esc(r)}</li>`).join("");
  const chg = market.kas.at(-1) / market.kas.at(-2) - 1;
  $("backdrop").innerHTML =
    `KAS ${usd(ev.price, 4)} (${pct(chg, 1)} 24h) · ${pct(ev.vs200)} vs 200-day · RSI ${ev.rsi.toFixed(0)}` +
    (ev.fng != null ? ` · Fear &amp; Greed ${ev.fng} (${esc(ev.fngLabel)})` : "") +
    `<br>Backdrop: Bitcoin is ${ev.btcUp ? "above" : "below"} its 200-day average` +
    ` (historically ${ev.btcUp ? "favorable" : "unfavorable"} for KAS jumps).`;
}

function buyText(b) {
  const total = Math.round(b.kas + b.btc);
  if (!total) return "Set a regular buy amount";
  const kas = Math.round(b.kas);              // round once so the parts add up to the total
  if (kas >= total) return `All ${usd(total)} → KAS`;
  if (kas <= 0) return `All ${usd(total)} → BTC`;
  return `${usd(kas)} KAS + ${usd(total - kas)} BTC`;
}

function renderPlan(ev) {
  $("plan-buy").textContent = buyText(ev.buy);
  $("plan-reason").textContent = ev.buy.reason;
  const ex = $("plan-extra");
  ex.hidden = !ev.buy.extra;
  if (ev.buy.extra) ex.innerHTML = `<b>Buy-zone conditions:</b> your extra budget of ${usd(ev.buy.extra)} → KAS.`;
  const tr = $("plan-trim");
  tr.hidden = !ev.trim;
  if (ev.trim) tr.innerHTML = `<b>Trim-zone conditions:</b> your plan says consider selling about ${ev.trim.pct}% of your KAS
    (${usd(ev.trim.usd)}). Selling is usually taxable.`;
  const every = { 7: "week", 14: "2 weeks", 30: "month" }[settings.dcaDays] || `${settings.dcaDays} days`;
  $("plan-period").textContent = `Every ${every}. KAS/BTC is ${ev.ratio.toFixed(1)} sats ` +
    `(normal range ${ev.ratioBand[0].toFixed(1)}–${ev.ratioBand[1].toFixed(1)}), RSI ${ev.ratioRsi.toFixed(0)}.`;
  if (embed && !document.querySelector(".embed-link")) {
    const a = document.createElement("a");
    a.className = "embed-link"; a.target = "_blank"; a.rel = "noopener";
    a.href = location.href.replace(/[?&]embed=[^&]*/, "").replace(/\?$/, "");
    a.textContent = `Open ${SITE.name}${SITE.credit?.name ? ` · by ${SITE.credit.name}` : ""} →`;
    $("plan-card").append(a);
  }
}

// Every holding with a known price: KAS, BTC and other tokens
function holdingRows(ev) {
  const rows = [
    { sym: "KAS", color: KASPA.color, units: settings.kasUnits, price: ev.price },
    { sym: "BTC", color: TOKEN.BTC.color, units: settings.btcUnits, price: ev.btc },
    ...Object.entries(settings.holdings).map(([sym, units]) =>
      ({ sym, color: TOKEN[sym]?.color || "#888", units, price: rawHist[sym]?.at(-1)?.[1] ?? null })),
  ].filter((r) => r.units > 0);
  for (const r of rows) r.value = r.price != null ? r.units * r.price : null;
  return rows;
}

function renderPortfolio(ev = lastEv) {
  if (!ev) return;
  const rows = holdingRows(ev);
  if (!rows.length) {
    $("pf-value").textContent = "–";
    $("alloc").innerHTML = "";
    $("alloc-legend").innerHTML = "";
    $("pf-split").textContent = "Enter your holdings under Your plan.";
    $("pf-rebalance").textContent = "";
    return;
  }
  const total = rows.reduce((a, r) => a + (r.value || 0), 0);
  const loading = rows.some((r) => r.value == null);
  $("pf-value").textContent = usd(total) + (loading ? " (loading prices…)" : "");
  $("alloc").innerHTML = rows.filter((r) => r.value).map((r) =>
    `<span style="width:${(100 * r.value) / total}%;background:${r.color}" title="${r.sym}"></span>`).join("");
  $("alloc-legend").innerHTML = rows.map((r) => `<span><span class="dot" style="background:${r.color}"></span>${r.sym} ` +
    (r.value == null ? "…" : `${usd(r.value)} (${((100 * r.value) / total).toFixed(0)}%)`) + "</span>").join("");

  const p = ev.portfolio;
  if (!p.value) {
    $("pf-split").textContent = "Add KAS and BTC holdings for rebalancing guidance.";
    $("pf-rebalance").textContent = "";
    return;
  }
  $("pf-split").textContent = `KAS/BTC part: ${p.kasPct.toFixed(0)}% KAS, target ${p.target}% ± ${p.band}.`;
  const r = ev.rebalance;
  if (!r) {
    $("pf-rebalance").textContent = `Within ±${p.band} points of your target: no rebalancing needed.`;
  } else {
    let t = `${r.heavy} is overweight. Sending all new buys to ${r.light} restores your target in about ${r.buys} buys ` +
      `(~${r.weeks} weeks), with no sales and no tax.`;
    if (r.buys > 13) t += ` To rebalance at once, sell about ${usd(r.sellUsd)} of ${r.heavy} for ${r.light} (usually taxable).`;
    $("pf-rebalance").textContent = t;
  }
}

// ---------- if recent trends continue ----------
const units = (sym) => (sym === "KAS" ? settings.kasUnits : sym === "BTC" ? settings.btcUnits : settings.holdings[sym] || 0);
const dcaFor = (sym) => (sym === "KAS" ? (settings.dcaUsd * settings.dcaKasPct) / 100
  : sym === "BTC" ? settings.dcaUsd * (1 - settings.dcaKasPct / 100) : 0);
const fmtUnits = (u) => u.toLocaleString("en-US", { maximumFractionDigits: u < 10 ? 6 : 2 });

document.querySelectorAll("#trend-seg button").forEach((b) => (b.onclick = () => {
  settings.trendYears = +b.dataset.years; saveSettings(); renderTrends();
}));
document.querySelectorAll("#horizon-seg button").forEach((b) => (b.onclick = () => {
  settings.horizonYears = +b.dataset.h; saveSettings(); renderTrends();
}));

function renderTrends() {
  document.querySelectorAll("#trend-seg button").forEach((b) => b.classList.toggle("on", +b.dataset.years === settings.trendYears));
  document.querySelectorAll("#horizon-seg button").forEach((b) => b.classList.toggle("on", +b.dataset.h === settings.horizonYears));
  const el = $("trend-body");
  if (!market) return;
  const syms = [...new Set([
    ...(settings.kasUnits > 0 || dcaFor("KAS") > 0 ? ["KAS"] : []),
    ...(settings.btcUnits > 0 || dcaFor("BTC") > 0 ? ["BTC"] : []),
    ...Object.keys(settings.holdings).filter((sym) => settings.holdings[sym] > 0),
  ])];
  if (!syms.length) {
    el.innerHTML = `<p class="muted">Add your holdings under <b>Your plan</b> to see this.</p>`;
    return;
  }
  let days;
  if (settings.horizonYears > 0) days = Math.round(settings.horizonYears * 365);
  else if (settings.goalDate) days = Math.max(0, Math.round((Date.parse(settings.goalDate + "T00:00:00Z") - Date.now()) / 86400000));
  if (!days) {
    el.innerHTML = `<p class="muted">Set a goal date under <b>Your plan</b>, or choose 1Y, 3Y or 5Y.</p>`;
    return;
  }
  const until = new Date(Date.now() + days * 86400000);
  const build = (years) => syms.filter((sym) => rawHist[sym]).map((sym) => {
    const tr = trendRate(rawHist[sym], years);
    return { sym, units: units(sym), value: units(sym) * rawHist[sym].at(-1)[1], rate: tr?.rate ?? 0, tr, dca: dcaFor(sym) };
  });
  const rows = projectTrends(build(settings.trendYears), settings.dcaDays, days);
  const pending = syms.filter((sym) => !rawHist[sym]);
  const sum = (rs, k) => rs.reduce((a, r) => a + r[k], 0);
  const now = sum(rows, "value"), added = sum(rows, "invested"), proj = sum(rows, "projected");
  const color = (sym) => (sym === "KAS" ? KASPA.color : TOKEN[sym]?.color || "#888");
  const body = rows.map((r) => {
    const rate = r.tr ? `${pct(r.tr.rate)}${r.tr.short ? "*" : ""}` : "–";
    const chg = r.value + r.invested > 0 ? r.projected / (r.value + r.invested) - 1 : null;
    return `<tr><td><span class="dot" style="background:${color(r.sym)}"></span>${r.sym}</td>` +
      `<td class="num">${fmtUnits(r.units)}</td><td class="num">${usd(r.value)}</td>` +
      `<td class="num ${r.rate >= 0 ? "good" : "bad"}">${rate}</td><td class="num">${r.invested ? usd(r.invested) : "–"}</td>` +
      `<td class="num">${usd(r.projected)}</td><td class="num ${chg >= 0 ? "good" : "bad"}">${chg == null ? "–" : pct(chg)}</td></tr>`;
  }).join("");
  const alt = [1, 2, 3].map((y) => `${y}Y: ${usd(sum(projectTrends(build(y), settings.dcaDays, days), "projected"))}`).join(" · ");
  let goal = "";
  if (settings.goalUsd > 0) {
    const d = daysToGoal(build(settings.trendYears), settings.dcaDays, settings.goalUsd, 50 * 365);
    goal = d == null ? `<p>At these rates your <b>${usd(settings.goalUsd)}</b> goal is <b>not reached within 50 years</b>.</p>`
      : d === 0 ? `<p>You're already above your <b>${usd(settings.goalUsd)}</b> goal.</p>`
      : `<p>At these rates you'd reach your <b>${usd(settings.goalUsd)}</b> goal around <b>${new Date(Date.now() + d * 86400000)
          .toLocaleDateString("en", { month: "short", year: "numeric" })}</b> (${(d / 365).toFixed(1)} years).</p>`;
  }
  const short = rows.some((r) => r.tr?.short);
  el.innerHTML = `<p>Projected to <b>${until.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</b>
      using each coin's average yearly change over the last <b>${settings.trendYears} year${settings.trendYears > 1 ? "s" : ""}</b>.</p>
    <div class="table-scroll"><table><thead><tr><th>Asset</th><th class="num">Holding</th><th class="num">Value now</th>
      <th class="num">Trend / yr</th><th class="num">Regular buys</th><th class="num">Projected</th><th class="num">Change</th></tr></thead>
    <tbody>${body}<tr class="total"><td>Total</td><td></td><td class="num">${usd(now)}</td><td></td>
      <td class="num">${added ? usd(added) : "–"}</td><td class="num">${usd(proj)}</td>
      <td class="num ${proj >= now + added ? "good" : "bad"}">${now + added ? pct(proj / (now + added) - 1) : "–"}</td></tr></tbody></table></div>
    ${goal}
    <p class="small">Total with ${alt.split(" · ").length} different lookbacks: <b>${alt}</b></p>
    ${short ? `<p class="muted small">* Shorter price history: uses all available data.</p>` : ""}
    ${pending.length ? `<p class="muted small">Loading prices for ${pending.join(", ")}…</p>` : ""}`;
}

function renderHowto(ev) {
  if (chart.opts.mode === "compare") {
    $("howto-body").innerHTML = `<ul>
      <li>Every line starts at <b>0%</b> at the left edge of the visible range, so you see who gained or lost the most over exactly that period.</li>
      <li>The scale is logarithmic: a doubling (+100%) and a halving (−50%) are the same distance from 0%.</li>
      <li>Zoom or pan and the lines re-start from the new left edge. Coins with shorter history start where their data begins (Monero: about 2 years).</li>
      <li>Price performance reflects the whole market (sentiment, liquidity, listings), not only technology. See <b>Kaspa vs other networks</b> below for the differences.</li></ul>`;
    return;
  }
  const ratio = chart.opts.mode === "ratio";
  const th = thresholds(settings);
  $("howto-body").innerHTML = ratio ? `<ul>
    <li>The line is the KAS price measured in BTC (sats). <b>Rising</b> means KAS is beating BTC; <b>falling</b> means BTC is beating KAS.</li>
    <li>The shaded <b>band</b> is the 90-day normal range (average ± 1 standard deviation). Below it, KAS is unusually cheap vs BTC; above it, unusually expensive.</li>
    <li>The <b>KAS/BTC RSI</b> panel drives your buy tilt: below ${th.ratioCheap}, new money tilts to KAS; above ${th.ratioRich}, to BTC.</li>
    <li>In the backtest, swapping whole holdings on ratio signals did not beat holding BTC consistently; tilting <i>new</i> purchases did slightly better than a fixed split, with no sales.</li></ul>`
    : `<ul>
    <li><b>200-day average</b> (purple): the long-term trend. Price above it = uptrend. Your buy zone (green) is ${th.deepBelow}% or more below it; your trim zone (red) is ${th.stretchedAbove}% or more above it.</li>
    <li><b>50-day</b> (blue): the medium trend. Crossing above the 200-day is a "golden cross", below a "death cross".</li>
    <li><b>20-day</b> (amber): short-term momentum.</li>
    <li>Averages <b>lag</b>. In the KAS backtest, crossovers did worse than random at catching jumps: use them to read the trend, not to time trades.</li>
    <li><b>RSI</b> (lower panel): below 30 is oversold, above 70 overbought. Oversold readings were the best (but rare) buying moments.</li></ul>`;
}

function renderReport(series) {
  const fngByDay = new Map(market.fngDays);
  const rc = reportCard(market, series, fngByDay, settings);
  const pp = (x) => (x == null ? "–" : `${(x * 100).toFixed(0)}%`);
  const rr = (x) => (x == null ? "–" : pct(x));
  const row = (name, s) => `<tr><td>${name}</td><td class="num">${s.n ?? "–"}</td><td class="num">${pp(s.p)}</td><td class="num">${rr(s.r90)}</td></tr>`;
  const tilt = rc.tiltRows.map((r) => {
    const d = r.tilt / r.fixed - 1;
    return `<tr><td>${r.name}</td><td class="num">${usd(r.fixed * 100)}</td><td class="num">${usd(r.tilt * 100)}</td>` +
      `<td class="num ${d >= 0 ? "good" : "bad"}">${pct(d, 1)}</td></tr>`;
  }).join("");
  $("report-body").innerHTML = `
    <table><thead><tr><th></th><th class="num">Times</th><th class="num">+30% within 30d</th><th class="num">Median 90d</th></tr></thead>
    <tbody>${row("Any day (baseline)", { ...rc.base, n: "all" })}${row("Your buy-zone conditions", rc.buy)}${row("Your greed / trim conditions", rc.greed)}</tbody></table>
    <p class="small" style="margin-top:12px"><b>Your buy tilt vs a fixed split</b> (value of each $100 invested)</p>
    <table><thead><tr><th></th><th class="num">Fixed</th><th class="num">With tilt</th><th class="num">Difference</th></tr></thead><tbody>${tilt}</tbody></table>
    <p class="muted small">History ${day(rc.from)} – ${day(rc.to)}. Few events means weak evidence; past tendencies may not repeat.</p>`;
}

function renderGoal(ev) {
  const el = $("goal-body");
  if (!(settings.goalUsd > 0) || !settings.goalDate) {
    el.innerHTML = `<p class="muted">Set a target value and date under <b>Your plan</b> to see how your holdings and regular buys could get there.</p>`;
    return;
  }
  const until = Date.parse(settings.goalDate + "T00:00:00Z");
  const res = project(settings, ev.price, ev.btc, until);
  const rows = res.map((r) => `<tr><td>${r.name}</td><td class="num">${pct(r.kas)}/yr</td><td class="num">${pct(r.btc)}/yr</td>` +
    `<td class="num">${usd(r.value)}</td><td class="${r.value >= settings.goalUsd ? "good" : "bad"}">${r.value >= settings.goalUsd ? "Yes" : "No"}</td></tr>`).join("");
  el.innerHTML = `<p>Goal: <b>${usd(settings.goalUsd)}</b> by <b>${esc(settings.goalDate)}</b>
    (${res[0].days} days, ${usd(res[0].invested)} more invested at your current pace).</p>
    <table><thead><tr><th>Scenario</th><th class="num">KAS</th><th class="num">BTC</th><th class="num">Projected</th><th>Goal?</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted small">Growth rates are illustrative assumptions, not forecasts. Real prices swing far more than a smooth yearly rate.</p>`;
}

function renderNetwork(ev) {
  const n = market.net || {};
  const lines = [];
  if (n.hashrateTh) lines.push(`Network hashrate: <b>${(n.hashrateTh / 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })} PH/s</b>`);
  if (n.blockReward) lines.push(`Block reward: <b>${n.blockReward.toFixed(4)} KAS</b> × 10 blocks/s = <b>${Math.round(n.blockReward * 864000).toLocaleString("en-US")} KAS/day</b>`);
  if (n.nextReduction) {
    const d = Math.max(0, Math.ceil((n.nextReduction.at - Date.now()) / 86400000));
    lines.push(`Next monthly reward reduction: <b>in ${d} days</b> (${new Date(n.nextReduction.at).toLocaleDateString("en", { month: "short", day: "numeric" })}) to ${n.nextReduction.reward.toFixed(4)} KAS`);
  }
  if (n.circulating && n.maxSupply) {
    lines.push(`Supply: ${(n.circulating / 1e9).toFixed(2)}B of ${(n.maxSupply / 1e9).toFixed(2)}B (${((100 * n.circulating) / n.maxSupply).toFixed(1)}% mined)`);
  }
  $("network-body").innerHTML = lines.length ? `<ul class="reasons">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
    : `<p class="muted">Network data unavailable right now.</p>`;
  renderMining(ev);
}

function renderMining(ev = { price: market?.kas.at(-1) }) {
  const sel = $("miner");
  if (!sel.options.length) {
    MINERS.forEach((m, i) => sel.add(new Option(m.name, i)));
    sel.onchange = () => renderMining();
    $("kwh").oninput = () => renderMining();
  }
  const r = mining(MINERS[+sel.value || 0], +$("kwh").value || 0, market?.net, ev.price);
  $("mining-body").innerHTML = !r ? "" : `<table><tbody>
    <tr><td>Mined per day</td><td class="num">${r.kasDay.toFixed(1)} KAS (${usd(r.usdDay, 2)})</td></tr>
    <tr><td>Blocks found per day (average)</td><td class="num">${r.blocksPerDay.toFixed(0)}</td></tr>
    <tr><td>Electricity per day</td><td class="num">${usd(r.costDay, 2)}</td></tr>
    <tr><td>Profit per day</td><td class="num ${r.profitDay >= 0 ? "good" : "bad"}">${usd(r.profitDay, 2)}</td></tr>
    <tr><td>Break-even electricity price</td><td class="num">${usd(r.breakEven, 3)}/kWh</td></tr></tbody></table>
    <p class="muted small">Before pool fees and downtime. Rewards shrink each month and network hashrate changes daily.</p>`;
}

// ---------- shared price history (KAS, BTC, other tokens) ----------
const TOKEN = Object.fromEntries(TOKENS.map((t) => [t.sym, t]));
const rawHist = {};            // sym -> [[timestamp, close], ...]; null if it failed to load
const pendingHist = {};
let lastEv = null;

function ensureHistory(syms, force = false) {
  return Promise.all(syms.filter((sym) => TOKEN[sym] && sym !== "BTC").map((sym) => {
    if (sym in rawHist && !force) return null;
    pendingHist[sym] ??= loadPeerHistory(TOKEN[sym], { force })
      .then((h) => { rawHist[sym] = h; })
      .catch(() => { rawHist[sym] = null; })
      .finally(() => { delete pendingHist[sym]; });
    return pendingHist[sym];
  }));
}

// ---------- compare ----------
const PEERS_KEY = "kas-signals-peers";
let selectedPeers = (() => {
  try { return JSON.parse(localStorage.getItem(PEERS_KEY)) || PEERS.map((p) => p.sym); }
  catch { return PEERS.map((p) => p.sym); }
})();

$("peer-chips").innerHTML = TOKENS.map((p) =>
  `<label><input type="checkbox" value="${p.sym}" ${selectedPeers.includes(p.sym) ? "checked" : ""}>` +
  `<span class="dot" style="background:${p.color}"></span>${p.sym}</label>`).join("");
$("peer-chips").onchange = () => {
  selectedPeers = [...$("peer-chips").querySelectorAll("input:checked")].map((i) => i.value);
  try { localStorage.setItem(PEERS_KEY, JSON.stringify(selectedPeers)); } catch { /* private mode */ }
  loadCompare();
};

async function loadCompare(force = false) {
  if (!market) return;                       // called again once market data arrives
  const want = TOKENS.filter((p) => selectedPeers.includes(p.sym));
  const align = (pairs) => { const m = new Map(pairs); return market.t.map((ts) => m.get(ts) ?? null); };
  const lines = () => [{ sym: KASPA.sym, color: KASPA.color, values: market.kas, width: 2.6 },
    ...want.filter((p) => rawHist[p.sym]).map((p) => ({ sym: p.sym, color: p.color, values: align(rawHist[p.sym]) }))];
  chart.setCompare(lines());
  await Promise.all(want.map(async (p) => { await ensureHistory([p.sym], force); chart.setCompare(lines()); }));
}

function renderNetworks(caps) {
  const all = [KASPA, ...PEERS];
  const kasCirc = caps?.[KASPA.gecko]?.circulating || market?.net?.circulating;
  const big = (v) => (v == null ? "–" : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : `$${(v / 1e9).toFixed(1)}B`);
  const cell = (c, i) => `<td${i === 0 ? ' class="kas"' : ""}>${c}</td>`;
  const row = (label, f) => `<tr><td>${label}</td>${all.map((n, i) => cell(f(n), i)).join("")}</tr>`;
  const live = (n) => caps?.[n.gecko];
  $("networks-table").innerHTML =
    `<thead><tr><th></th>${all.map((n, i) => `<th${i === 0 ? ' class="kas"' : ""}><span class="dot" style="background:${n.color}"></span>${n.name} (${n.sym})</th>`).join("")}</tr></thead><tbody>` +
    row("Market cap", (n) => big(live(n)?.mcap)) +
    row("Rank", (n) => (live(n)?.rank ? `#${live(n).rank}` : "–")) +
    row("1-year change", (n) => {
      const c = live(n)?.change1y;
      return c == null ? "–" : `<span class="${c >= 0 ? "good" : "bad"}">${c >= 0 ? "+" : ""}${c.toFixed(0)}%</span>`;
    }) +
    row("KAS price at their market cap", (n) => {
      if (n === KASPA) return live(n)?.price ? `${usd(live(n).price, 4)} (today)` : "–";
      const m = live(n)?.mcap;
      if (!m || !kasCirc) return "–";
      const price = m / kasCirc, mult = live(KASPA)?.price ? price / live(KASPA).price : null;
      return `${usd(price, price < 1 ? 3 : 2)}${mult ? ` <span class="muted">(${mult.toFixed(mult < 10 ? 1 : 0)}×)</span>` : ""}`;
    }) +
    SPEC_ROWS.map(([k, label]) => row(label, (n) => esc(n.specs[k]))).join("") + "</tbody>";
  $("stands-out").innerHTML = SUMMARY.standsOut.map((x) => `<li>${esc(x)}</li>`).join("");
  $("others-lead").innerHTML = SUMMARY.othersLead.map((x) => `<li>${esc(x)}</li>`).join("");
}

// ---------- theme ----------
const THEME_KEY = "kas-signals-theme";
const THEMES = ["auto", "light", "dark"];
let theme = (() => { try { return localStorage.getItem(THEME_KEY) || "auto"; } catch { return "auto"; } })();
function applyTheme() {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  $("theme").textContent = `Theme: ${theme[0].toUpperCase()}${theme.slice(1)}`;
  chart.draw();
}
$("theme").onclick = () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  applyTheme();
};
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => chart.draw());
applyTheme();

// ---------- guide ----------
$("guide-body").innerHTML = GUIDE;
const openGuide = (section) => {
  $("guide").showModal();
  const target = section && document.getElementById(`g-${section}`);
  if (target) target.scrollIntoView(); else $("guide-body").scrollTop = 0;
};
$("open-guide").onclick = () => openGuide();
$("close-guide").onclick = () => $("guide").close();
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-guide]");
  if (a) { e.preventDefault(); openGuide(a.dataset.guide); }
});

// ---------- share ----------
async function share() {
  const by = SITE.credit?.name ? ` by ${SITE.credit.name}` : "";
  const mark = `${SITE.name}${by}${SITE.url ? " · " + SITE.url.replace(/^https?:\/\//, "") : ""} · Not financial advice`;
  const blob = await chart.exportPng(mark);
  const file = new File([blob], `kas-signals-${chart.opts.mode}.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: SITE.name }); return; } catch { /* cancelled */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- settings dialog ----------
function openSettings() {
  const f = $("settings-form");
  for (const [k, v] of Object.entries(settings)) if (f.elements[k] && typeof v !== "object") f.elements[k].value = v || (v === 0 ? "" : v);
  f.elements.dcaDays.value = String(settings.dcaDays);
  $("profiles").innerHTML = Object.entries(PROFILES).map(([key, p]) =>
    `<label><input type="radio" name="profile" value="${key}" ${settings.profile === key ? "checked" : ""}>
     <span><b>${p.label}</b><br><span class="muted small">${p.note}</span></span></label>`).join("");
  fillThresholds();
  fillHoldings();
  $("settings").showModal();
}

function fillHoldings() {
  const held = Object.keys(settings.holdings);
  $("other-holdings").innerHTML = held.map((sym) => `<div class="token-row">
      <b><span class="dot" style="background:${TOKEN[sym]?.color || "#888"}"></span>${sym}</b>
      <input type="number" min="0" step="any" data-hold="${sym}" value="${settings.holdings[sym] || ""}" placeholder="Amount of ${sym}">
      <button type="button" data-remove="${sym}">Remove</button></div>`).join("") || `<p class="muted small">None yet.</p>`;
  const avail = TOKENS.filter((t) => t.sym !== "BTC" && !held.includes(t.sym));
  $("add-token-sym").innerHTML = avail.map((t) => `<option value="${t.sym}">${t.name} (${t.sym})</option>`).join("");
  $("add-token").disabled = !avail.length;
}
$("add-token").onclick = () => {
  const sym = $("add-token-sym").value;
  if (!sym) return;
  settings.holdings = { ...settings.holdings, [sym]: 0 };
  saveSettings();
  fillHoldings();
  document.querySelector(`[data-hold="${sym}"]`)?.focus();
};
$("other-holdings").onclick = (e) => {
  const b = e.target.closest("[data-remove]");
  if (!b) return;
  const h = { ...settings.holdings };
  delete h[b.dataset.remove];
  settings.holdings = h;
  saveSettings();
  fillHoldings();
  render();
};

function fillThresholds() {
  const th = thresholds({ ...settings, overrides: {} });
  $("thresholds").innerHTML = THRESHOLD_FIELDS.map(([k, label]) =>
    `<label>${label}<input data-th="${k}" type="number" step="1" placeholder="${th[k]}" value="${settings.overrides?.[k] ?? ""}"></label>`).join("");
}

$("settings-form").addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.hold) {
    settings.holdings = { ...settings.holdings, [el.dataset.hold]: Math.max(0, Number(el.value) || 0) };
  } else if (el.dataset.th) {
    const o = { ...(settings.overrides || {}) };
    if (el.value === "") delete o[el.dataset.th]; else o[el.dataset.th] = Number(el.value);
    settings.overrides = o;
  } else if (el.name === "profile") {
    settings.profile = el.value;
    fillThresholds();
  } else if (el.name) {
    settings[el.name] = el.type === "number" || el.name === "dcaDays" ? Math.max(0, Number(el.value) || 0) : el.value;
  }
  saveSettings();
  render();
});
$("settings-form").addEventListener("change", (e) => { if (e.target.name === "dcaDays") { settings.dcaDays = Number(e.target.value); saveSettings(); render(); } });
$("reset-settings").onclick = () => {
  settings = { ...DEFAULT_SETTINGS, overrides: {}, holdings: {} };
  saveSettings();
  $("settings").close();
  render();
  openSettings();
};

// ---------- site config: name, donations, repo ----------
document.title = SITE.name;
const credit = SITE.credit || {};
if (credit.name) {
  $("byline").hidden = false;
  $("byline-link").textContent = credit.name;
  $("credit").hidden = false;
  $("credit-name").textContent = credit.name;
  $("credit-tagline").textContent = credit.tagline || "";
  if (credit.url) {
    $("byline-link").href = credit.url;
    $("credit-cta").href = credit.url;
    $("credit-cta").textContent = `${credit.cta || "Learn more"} →`;
  } else {
    $("byline-link").removeAttribute("href");
    $("credit-cta").hidden = true;
  }
}
$("site-name").textContent = SITE.name;
if (SITE.repo) $("repo-link").innerHTML = `Open source: <a href="${esc(SITE.repo)}" rel="noopener">${esc(SITE.repo.replace(/^https?:\/\//, ""))}</a>`;
const addrs = Object.entries(SITE.donate || {}).filter(([k, a]) => a && (k === "kas" || k === "btc"));
const addrRow = ([coin, a]) =>
  `<div class="addr"><b>${coin.toUpperCase()}</b><code>${esc(a)}</code><button type="button" data-copy="${esc(a)}">Copy</button></div>`;
if (addrs.length) {
  $("donate").hidden = false;
  $("donate-rows").innerHTML = addrs.map(addrRow).join("");
}
// Donation amount: default is 100 KAS or $5 worth, whichever is less
const DON_MIN = 1, DON_MAX = 10000, DON_DEFAULT_KAS = 100, DON_DEFAULT_USD = 5;
const kas = SITE.donate?.kas;
const kasUri = kas ? (kas.startsWith("kaspa:") ? kas : "kaspa:" + kas) : null;
$("donate-body").innerHTML = !addrs.length
  ? `<p class="muted">The site owner hasn't added a donation address yet (set it in <code>js/config.js</code>).</p>`
  : (kas ? `<div class="donate-amount">
        <div class="amount-line"><b id="don-kas"></b> <span id="don-usd" class="muted"></span></div>
        <input type="range" id="don-slider" min="0" max="1000" step="1" aria-label="Donation amount in KAS">
        <div class="range-ends small muted"><span>${DON_MIN} KAS</span><span>${DON_MAX.toLocaleString("en-US")} KAS</span></div>
      </div>` : "") +
    (kas ? `<div class="donate-qr" id="don-qr"></div>` : "") +
    addrs.map(addrRow).join("") +
    (kas ? `<div class="donate-actions"><a id="don-wallet" href="${esc(kasUri)}">Open in wallet</a>
        <button type="button" id="don-copy" data-copy="">Copy amount</button></div>
      <p class="small muted">The QR code is a payment request that includes the amount. If your wallet doesn't
        pre-fill it, enter the amount shown above.</p>` : "");

// The slider is logarithmic so small and large amounts are both easy to pick
const donStep = (k) => (k < 10 ? 1 : k < 100 ? 5 : k < 1000 ? 10 : 50);
const donRound = (k) => Math.min(DON_MAX, Math.max(DON_MIN, Math.round(k / donStep(k)) * donStep(k)));
const donFromSlider = (v) => donRound(DON_MIN * Math.pow(DON_MAX / DON_MIN, v / 1000));
const donToSlider = (k) => Math.round((1000 * Math.log(k / DON_MIN)) / Math.log(DON_MAX / DON_MIN));
let donKas = null, donTouched = false;

function donDefault() {
  const price = market?.kas.at(-1);
  if (!price) return DON_DEFAULT_KAS;
  const fiveUsd = DON_DEFAULT_USD / price;
  if (fiveUsd >= DON_DEFAULT_KAS) return DON_DEFAULT_KAS;
  return Math.max(DON_MIN, Math.floor(fiveUsd / donStep(fiveUsd)) * donStep(fiveUsd));   // round down: stay at or under $5
}

function showDonation() {
  if (!kas) return;
  const price = market?.kas.at(-1);
  $("don-kas").textContent = `${donKas.toLocaleString("en-US")} KAS`;
  $("don-usd").textContent = price ? `≈ ${usd(donKas * price, 2)}` : "";
  $("don-slider").value = donToSlider(donKas);
  $("don-wallet").href = `${kasUri}?amount=${donKas}`;
  $("don-wallet").textContent = `Open in wallet (${donKas.toLocaleString("en-US")} KAS)`;
  $("don-copy").dataset.copy = String(donKas);
  // Payment-request QR (address + amount); fall back to the static address image if it can't be built
  const svg = qrSvg(`${kasUri}?amount=${donKas}`, { label: `QR code: donate ${donKas} KAS` });
  $("don-qr").innerHTML = svg || (SITE.donate.kasQr
    ? `<img src="${esc(SITE.donate.kasQr)}" alt="QR code for the KAS donation address">` : "");
}
if (kas) $("don-slider").oninput = (e) => { donTouched = true; donKas = donFromSlider(+e.target.value); showDonation(); };

function openDonate() {
  if (kas) { donKas ??= donDefault(); showDonation(); }
  $("donate-dialog").showModal();
}
$("donate-btn").onclick = openDonate;
if (q.has("donate")) {                // shareable link: ?donate=1, or ?donate=250 to suggest 250 KAS
  const suggested = Number(q.get("donate"));
  if (kas && suggested > 1) { donKas = donRound(suggested); donTouched = true; }
  openDonate();
}
$("close-donate").onclick = () => $("donate-dialog").close();
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copy]");
  if (!b) return;
  const label = b.dataset.label || (b.dataset.label = b.textContent);
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied"; }
  catch { b.textContent = "Select and copy"; }
  setTimeout(() => (b.textContent = label), 2000);
});

load();
setInterval(() => load(true), REFRESH_MS);
