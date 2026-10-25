// Canvas chart: price or KAS/BTC ratio, moving averages, zones/bands, RSI panel,
// zoom (wheel / pinch), pan (drag), hover readout, PNG export.
const M = { l: 64, r: 12, t: 30, b: 24 };
const RANGES = { "3M": 90, "6M": 182, "1Y": 365, "2Y": 730, "3Y": 1095, "5Y": 1825, All: Infinity };
const LABELS = { sma20: "20-day", sma50: "50-day", sma200: "200-day" };
const MIN_DAYS = 30;

export class Chart {
  constructor(canvas, { onView } = {}) {
    this.c = canvas;
    this.ctx = canvas.getContext("2d");
    this.onView = onView || (() => {});
    this.opts = { mode: "price", sma20: true, sma50: true, sma200: true, zones: true, log: false };
    this.series = null;
    this.view = null;
    this.hover = null;
    this.drag = null;
    this._bind();
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  setData(series) {
    const keep = this.view && this.series && this.series.t.length === series.t.length;
    this.series = series;
    if (!keep) this.setRange(this.rangeName || "1Y");
    else this.draw();
  }

  get n() { return this.series ? this.series.t.length : 0; }

  setRange(name) {
    this.rangeName = name;
    const days = Math.min(RANGES[name], this.n);
    this.view = [this.n - days, this.n];
    this.onView(this.viewInfo(RANGES[name] > this.n && RANGES[name] !== Infinity ? name : null));
    this.draw();
  }

  setOpt(k, v) { this.opts[k] = v; this.draw(); }

  // lines: [{ sym, color, values }] aligned to series.t (null where a coin has no data)
  setCompare(lines) { this.compare = lines; this.draw(); }

  viewInfo(shortOf) {
    const [s, e] = this.view;
    return { from: this.series.t[s], to: this.series.t[e - 1], days: e - s, shortOf,
             firstTs: this.series.t[0], totalDays: this.n };
  }

  _setView(start, len) {
    len = Math.round(Math.min(Math.max(len, MIN_DAYS), this.n));
    start = Math.round(Math.min(Math.max(start, 0), this.n - len));
    this.view = [start, start + len];
    this.onView(this.viewInfo(null));
    this.draw();
  }

  zoom(factor, anchorX) {
    if (!this.view) return;
    const [s, e] = this.view, len = e - s;
    const a = anchorX != null ? this._indexAt(anchorX) ?? (s + e) / 2 : (s + e) / 2;
    const frac = (a - s) / Math.max(1, len), nl = len * factor;
    this._setView(a - frac * nl, nl);
  }

  _indexAt(x) {
    const [s, e] = this.view;
    const pw = this.c.clientWidth - M.l - M.r;
    const f = (x - M.l) / Math.max(1, pw);
    return f < 0 || f > 1 ? null : s + Math.round(f * (e - 1 - s));
  }

  _bind() {
    const c = this.c;
    c.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      this.zoom(Math.pow(1.0015, ev.deltaY), ev.offsetX);
    }, { passive: false });
    c.addEventListener("pointerdown", (ev) => {
      c.setPointerCapture(ev.pointerId);
      this.pointers = this.pointers || new Map();
      this.pointers.set(ev.pointerId, ev.offsetX);
      if (this.pointers.size === 1) this.drag = { x: ev.offsetX, view: [...this.view] };
      if (this.pointers.size === 2) {
        const xs = [...this.pointers.values()];
        this.pinch = { d: Math.abs(xs[0] - xs[1]) || 1, view: [...this.view], mid: (xs[0] + xs[1]) / 2 };
        this.drag = null;
      }
    });
    c.addEventListener("pointermove", (ev) => {
      if (this.pointers?.has(ev.pointerId)) this.pointers.set(ev.pointerId, ev.offsetX);
      if (this.pinch && this.pointers?.size === 2) {
        const xs = [...this.pointers.values()];
        const d = Math.abs(xs[0] - xs[1]) || 1;
        const [s, e] = this.pinch.view;
        this.view = [s, e];
        this.zoom(this.pinch.d / d, this.pinch.mid);
        return;
      }
      if (this.drag) {
        const [s, e] = this.drag.view;
        const pw = c.clientWidth - M.l - M.r;
        this._setView(s + ((this.drag.x - ev.offsetX) / pw) * (e - s), e - s);
        if (Math.abs(this.drag.x - ev.offsetX) > 3) this.hover = null;
        return;
      }
      const i = this._indexAt(ev.offsetX);
      if (i !== this.hover) { this.hover = i; this.draw(); }
    });
    const end = (ev) => {
      this.pointers?.delete(ev.pointerId);
      if (!this.pointers?.size) { this.drag = null; this.pinch = null; }
      if (ev.pointerType === "touch") { this.hover = null; this.draw(); }
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", () => { if (!this.drag) { this.hover = null; this.draw(); } });
  }

  _colors() {
    const cs = getComputedStyle(this.c);
    const v = (n) => cs.getPropertyValue(n).trim();
    return { fg: v("--fg"), muted: v("--muted"), grid: v("--grid"), bg: v("--surface"),
             buy: v("--buy"), trim: v("--trim"), sma20: v("--ma20"), sma50: v("--ma50"), sma200: v("--ma200") };
  }

  draw(target = this.ctx, W = this.c.clientWidth, H = this.c.clientHeight, watermark = null) {
    if (!this.series || !this.view || W < 100 || H < 120) return;
    const ctx = target;
    if (target === this.ctx) {
      const dpr = window.devicePixelRatio || 1;
      this.c.width = Math.round(W * dpr);
      this.c.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const col = this._colors();
    const mode = this.opts.mode, s = this.series[mode] || this.series.price, t = this.series.t;
    const [start, end] = this.view, span = Math.max(1, end - 1 - start), days = end - start;
    const fmt = mode === "price"
      ? (v) => (v < 1 ? `$${v.toFixed(4)}` : `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
      : (v) => `${v.toFixed(1)} sats`;
    ctx.font = "11px system-ui, sans-serif";
    const legend = this._legend(mode, col);
    const legendRows = this._legendRows(ctx, legend, W);
    const MT = M.t + (legendRows - 1) * 14;
    const gap = 16, rsiH = (H - MT - M.b - gap) * 0.24, priceH = H - MT - M.b - gap - rsiH;
    const pw = W - M.l - M.r, ry0 = MT + priceH + gap;
    const X = (i) => M.l + ((i - start) / span) * pw;

    ctx.clearRect(0, 0, W, H);
    if (watermark) { ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, H); }
    if (mode === "compare") return this._drawCompare(ctx, W, H, col, watermark);

    const keys = ["line", ...["sma20", "sma50", "sma200"].filter((k) => this.opts[k])];
    let lo = Infinity, hi = -Infinity;
    for (const k of keys) for (let i = start; i < end; i++) { const v = s[k][i]; if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    if (this.opts.zones && s.zone_lo?.[end - 1]) {
      lo = Math.min(lo, s.zone_lo[end - 1]); hi = Math.max(hi, s.zone_hi[end - 1]);
    }
    const log = this.opts.log;
    if (log) { lo /= 1.06; hi *= 1.06; } else { const p = (hi - lo) * 0.06; lo = Math.max(lo - p, 1e-9); hi += p; }
    const tf = log ? Math.log : (v) => v;
    const tlo = tf(lo), thi = tf(hi);
    const Y = (v) => MT + priceH - ((tf(v) - tlo) / (thi - tlo)) * priceH;
    const RY = (v) => ry0 + rsiH - (v / 100) * rsiH;

    ctx.font = "11px system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    const text = (str, x, y, align = "left", color = col.muted) => {
      ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(str, x, y);
    };
    const clipPrice = () => { ctx.save(); ctx.beginPath(); ctx.rect(M.l, MT, pw, priceH); ctx.clip(); };

    // zones / bands
    if (this.opts.zones && s.zone_lo) {
      clipPrice();
      for (const [k, c, below] of [["zone_lo", col.buy, true], ["zone_hi", col.trim, false]]) {
        const pts = [];
        for (let i = start; i < end; i++) if (s[k][i] != null) pts.push([X(i), Y(s[k][i])]);
        if (pts.length < 2) continue;
        ctx.beginPath();
        const edge = below ? MT + priceH : MT;
        ctx.moveTo(pts[0][0], edge);
        for (const [x, y] of pts) ctx.lineTo(x, y);
        ctx.lineTo(pts.at(-1)[0], edge);
        ctx.closePath();
        ctx.globalAlpha = 0.14; ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    // price grid
    ctx.lineWidth = 1;
    for (const v of log ? logTicks(lo, hi) : niceTicks(lo, hi, 6)) {
      const y = Y(v);
      if (y < MT || y > MT + priceH) continue;
      ctx.strokeStyle = col.grid; ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(M.l + pw, y); ctx.stroke();
      text(fmt(v), M.l - 6, y + 4, "right");
    }

    dateLabels(ctx, t, start, end, X, pw, MT, ry0 + rsiH, col, text);

    // lines
    const line = (arr, color, w, y = Y, from = start) => {
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath();
      let on = false;
      for (let i = from; i < end; i++) {
        const v = arr[i];
        if (v == null) { on = false; continue; }
        on ? ctx.lineTo(X(i), y(v)) : ctx.moveTo(X(i), y(v));
        on = true;
      }
      ctx.stroke();
    };
    clipPrice();
    for (const k of ["sma200", "sma50", "sma20"]) if (this.opts[k]) line(s[k], col[k], 1.8);
    line(s.line, col.fg, days < 800 ? 1.4 : 1);
    ctx.restore();

    // legend
    let lx = M.l + 4, ly = M.t - 18;
    // Legend items wrap onto extra rows inside the chart when the screen is narrow
    for (const [label, c] of legend) {
      const w = ctx.measureText(label).width + 30;
      if (lx + w > W - M.r && lx > M.l + 4) { lx = M.l + 4; ly += 14; }
      ctx.fillStyle = c; ctx.fillRect(lx, ly, 12, 4);
      text(label, lx + 16, ly + 6, "left", col.fg);
      lx += w;
    }

    // RSI panel
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = col.trim; ctx.fillRect(M.l, RY(100), pw, RY(70) - RY(100));
    ctx.fillStyle = col.buy; ctx.fillRect(M.l, RY(30), pw, RY(0) - RY(30));
    ctx.globalAlpha = 1;
    for (const v of [30, 50, 70]) {
      ctx.setLineDash(v === 50 ? [] : [4, 4]); ctx.strokeStyle = col.grid;
      ctx.beginPath(); ctx.moveTo(M.l, RY(v)); ctx.lineTo(M.l + pw, RY(v)); ctx.stroke();
      text(String(v), M.l - 6, RY(v) + 4, "right");
    }
    ctx.setLineDash([]);
    text(mode === "price" ? "RSI (14)" : "KAS/BTC RSI (14): low = KAS cheap vs BTC, high = KAS expensive",
      M.l + 6, ry0 + 12);
    line(s.rsi, col.fg, days < 800 ? 1.1 : 0.8, RY);

    // hover readout
    const hv = this.hover;
    if (hv != null && hv >= start && hv < end && !watermark) {
      const x = X(hv);
      ctx.strokeStyle = col.muted; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, ry0 + rsiH); ctx.stroke();
      const rows = [new Date(t[hv] * 1000).toLocaleDateString("en", { weekday: "short", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }),
        `${mode === "price" ? "Price" : "KAS/BTC"}: ${fmt(s.line[hv])}`];
      for (const k of ["sma20", "sma50", "sma200"]) if (s[k][hv] != null) rows.push(`${LABELS[k]}: ${fmt(s[k][hv])}`);
      if (mode === "price" && s.sma200[hv]) rows.push(`vs 200-day: ${pctStr(s.line[hv] / s.sma200[hv] - 1)}`);
      if (mode === "ratio" && s.zone_lo[hv] != null) {
        const v = s.line[hv];
        rows.push(`KAS is ${v < s.zone_lo[hv] ? "cheap (below band)" : v > s.zone_hi[hv] ? "rich (above band)" : "within band"}`);
      }
      if (s.rsi[hv] != null) rows.push(`RSI: ${s.rsi[hv].toFixed(0)}`);
      ctx.font = "12px system-ui, sans-serif";
      const bw = Math.max(...rows.map((r) => ctx.measureText(r).width)) + 16, bh = rows.length * 16 + 10;
      const bx = x + 12 + bw < W - M.r ? x + 12 : x - 12 - bw;
      ctx.fillStyle = col.bg; ctx.globalAlpha = 0.95; ctx.fillRect(bx, MT + 6, bw, bh); ctx.globalAlpha = 1;
      ctx.strokeStyle = col.grid; ctx.strokeRect(bx, MT + 6, bw, bh);
      rows.forEach((r, j) => text(r, bx + 8, MT + 22 + j * 16, "left", j ? col.fg : col.muted));
    }

    if (watermark) {
      ctx.font = "12px system-ui, sans-serif";
      text(watermark, W - M.r, H - 4, "right");
    }
  }

  // Performance comparison: every line rebased to its first value in the visible range, log scale
  _drawCompare(ctx, W, H, col, watermark) {
    const t = this.series.t, [start, end] = this.view, span = Math.max(1, end - 1 - start);
    const lines = (this.compare || []).map((ln) => {
      let base = null, first = null;
      const rel = new Array(end).fill(null);
      for (let i = start; i < end; i++) {
        const v = ln.values[i];
        if (v == null) continue;
        if (base == null) { base = v; first = i; }
        rel[i] = v / base;
      }
      return { ...ln, rel, first, lastRel: rel.findLast((v) => v != null) };
    }).filter((ln) => ln.lastRel != null);
    ctx.font = "11px system-ui, sans-serif";
    const text = (str, x, y, align = "left", color = col.muted) => {
      ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(str, x, y);
    };
    if (!lines.length) { text("Loading comparison data…", W / 2, H / 2, "center"); return; }

    const since = (i) => new Date(t[i] * 1000).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" });
    const legend = lines.map((ln) => [`${ln.sym} ${pctStr(ln.lastRel - 1)}` +
      (ln.first - start > 7 ? ` (since ${since(ln.first)})` : ""), ln.color]);
    const rows = this._legendRows(ctx, legend, W);
    const MT = M.t + (rows - 1) * 14, plotH = H - MT - M.b, pw = W - M.l - M.r;
    const X = (i) => M.l + ((i - start) / span) * pw;
    let lo = Infinity, hi = -Infinity;
    for (const ln of lines) for (let i = start; i < end; i++) {
      const v = ln.rel[i]; if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    lo /= 1.08; hi *= 1.08;
    const Y = (v) => MT + plotH - ((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * plotH;

    ctx.lineWidth = 1;
    for (const v of logTicks(lo, hi)) {
      const y = Y(v);
      if (y < MT || y > MT + plotH) continue;
      ctx.strokeStyle = Math.abs(v - 1) < 1e-9 ? col.muted : col.grid;
      ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(M.l + pw, y); ctx.stroke();
      text(pctStr(v - 1), M.l - 6, y + 4, "right");
    }
    dateLabels(ctx, t, start, end, X, pw, MT, MT + plotH, col, text);

    ctx.save(); ctx.beginPath(); ctx.rect(M.l, MT, pw, plotH); ctx.clip();
    for (const ln of [...lines].reverse()) {          // first line (KAS) drawn last, on top
      ctx.strokeStyle = ln.color; ctx.lineWidth = ln.width || 1.5; ctx.beginPath();
      let on = false;
      for (let i = start; i < end; i++) {
        const v = ln.rel[i];
        if (v == null) { on = false; continue; }
        on ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v));
        on = true;
      }
      ctx.stroke();
    }
    ctx.restore();

    let lx = M.l + 4, ly = M.t - 18;
    for (const [label, c] of legend) {
      const w = ctx.measureText(label).width + 30;
      if (lx + w > W - M.r && lx > M.l + 4) { lx = M.l + 4; ly += 14; }
      ctx.fillStyle = c; ctx.fillRect(lx, ly, 12, 4);
      text(label, lx + 16, ly + 6, "left", col.fg);
      lx += w;
    }

    const hv = this.hover;
    if (hv != null && hv >= start && hv < end && !watermark) {
      const x = X(hv);
      ctx.strokeStyle = col.muted; ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, MT + plotH); ctx.stroke();
      const rowsTxt = [[new Date(t[hv] * 1000).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }), col.muted],
        ...lines.filter((ln) => ln.rel[hv] != null).sort((a, b) => b.rel[hv] - a.rel[hv])
          .map((ln) => [`${ln.sym}: ${pctStr(ln.rel[hv] - 1)}`, ln.color])];
      ctx.font = "12px system-ui, sans-serif";
      const bw = Math.max(...rowsTxt.map(([r]) => ctx.measureText(r).width)) + 16, bh = rowsTxt.length * 16 + 10;
      const bx = x + 12 + bw < W - M.r ? x + 12 : x - 12 - bw;
      ctx.fillStyle = col.bg; ctx.globalAlpha = 0.95; ctx.fillRect(bx, MT + 6, bw, bh); ctx.globalAlpha = 1;
      ctx.strokeStyle = col.grid; ctx.strokeRect(bx, MT + 6, bw, bh);
      rowsTxt.forEach(([r, c], j) => text(r, bx + 8, MT + 22 + j * 16, "left", j ? c : col.muted));
    }
    if (watermark) { ctx.font = "12px system-ui, sans-serif"; text(watermark, W - M.r, H - 4, "right"); }
  }

  _legend(mode, col) {
    const legend = [[mode === "price" ? "KAS price" : "KAS/BTC", col.fg],
      ...["sma20", "sma50", "sma200"].filter((k) => this.opts[k]).map((k) => [`${LABELS[k]} avg`, col[k]])];
    if (this.opts.zones) legend.push(...(mode === "price"
      ? [["Buy zone", col.buy], ["Trim zone", col.trim]]
      : [["KAS cheap vs BTC", col.buy], ["KAS rich vs BTC", col.trim]]));
    return legend;
  }

  _legendRows(ctx, legend, W) {
    let lx = M.l + 4, rows = 1;
    for (const [label] of legend) {
      const w = ctx.measureText(label).width + 30;
      if (lx + w > W - M.r && lx > M.l + 4) { lx = M.l + 4; rows++; }
      lx += w;
    }
    return rows;
  }

  // Render at a fixed size with a background and watermark, return a PNG Blob
  exportPng(watermark, w = 1200, h = 675) {
    const off = document.createElement("canvas");
    off.width = w * 2; off.height = h * 2;
    const ctx = off.getContext("2d");
    ctx.scale(2, 2);
    const hover = this.hover; this.hover = null;
    this.draw(ctx, w, h, watermark);
    this.hover = hover;
    this.draw();
    return new Promise((res) => off.toBlob(res, "image/png"));
  }
}

// Month/quarter/year labels with vertical grid lines, spaced ~60px apart at any width
function dateLabels(ctx, t, start, end, X, pw, yTop, yBottom, col, text) {
  const perMonth = pw / ((end - start) / 30.4);
  const step = [1, 2, 3, 6, 12].find((m) => perMonth * m >= 60) || 12;
  const seen = new Set();
  ctx.lineWidth = 1;
  for (let i = start; i < end; i++) {
    const d = new Date(t[i] * 1000);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (seen.has(key) || d.getUTCDate() > 7 || d.getUTCMonth() % step !== 0) continue;
    seen.add(key);
    const x = X(i);
    ctx.strokeStyle = col.grid; ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(x, yBottom); ctx.stroke();
    const label = step === 12 ? `${d.getUTCFullYear()}`
      : d.toLocaleString("en", { month: "short", timeZone: "UTC" }) + (d.getUTCMonth() === 0 ? ` ${d.getUTCFullYear()}` : "");
    text(label, x, yBottom + 16, "center");
  }
}

const pctStr = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(0)}%`;

function niceTicks(lo, hi, n) {
  const span = hi - lo;
  if (span <= 0) return [lo];
  let step = 10 ** Math.floor(Math.log10(span / n));
  for (const m of [1, 2, 2.5, 5, 10]) if (span / (step * m) <= n) { step *= m; break; }
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}

function logTicks(lo, hi) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
    for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= lo && v <= hi) out.push(v); }
  return out.length >= 3 ? out : niceTicks(lo, hi, 6);
}
