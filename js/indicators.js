// Indicator math on plain arrays. Values before an indicator has enough data are null.

export function sma(xs, n) {
  const out = new Array(xs.length).fill(null);
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i];
    if (i >= n) sum -= xs[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

// Wilder's RSI
export function rsi(xs, n = 14) {
  const out = new Array(xs.length).fill(null);
  if (xs.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const d = xs[i] - xs[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

// Rolling mean +/- k standard deviations of log(xs), returned in xs units
export function logBands(xs, n = 90, k = 1) {
  const lo = new Array(xs.length).fill(null);
  const hi = new Array(xs.length).fill(null);
  const logs = xs.map(Math.log);
  for (let i = n - 1; i < xs.length; i++) {
    let m = 0;
    for (let j = i - n + 1; j <= i; j++) m += logs[j];
    m /= n;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (logs[j] - m) ** 2;
    const sd = Math.sqrt(v / (n - 1));
    lo[i] = Math.exp(m - k * sd);
    hi[i] = Math.exp(m + k * sd);
  }
  return { lo, hi };
}

export const last = (arr) => arr[arr.length - 1];

export function median(xs) {
  const s = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
