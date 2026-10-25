// Market data from public APIs that allow browser access (CORS). Cached in localStorage.
const GATE = (pair, from, to) =>
  `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${pair}&interval=1d&from=${from}&to=${to}`;
const FNG = "https://api.alternative.me/fng/?limit=0";
const KASPA = "https://api.kaspa.org";
const CACHE_KEY = "kas-signals-market-v1";
const TTL_MS = 30 * 60 * 1000;

async function getJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
  return r.json();
}

// Gate.io returns at most 1,000 candles per request: page back to the start of trading
async function dailyCloses(pair, maxDays = 2200) {
  const byTs = new Map();
  let to = Math.floor(Date.now() / 1000);
  while (byTs.size < maxDays) {
    const from = to - 999 * 86400;
    const page = await getJson(GATE(pair, from, to));
    for (const r of page) if (+r[2] > 0) byTs.set(+r[0], +r[2]);
    if (page.length < 999) break;
    to = from - 86400;
  }
  return byTs;
}

async function network() {
  const get = (p) => getJson(KASPA + p).catch(() => null);
  const [hr, br, hv, cs] = await Promise.all([
    get("/info/hashrate?stringOnly=false"), get("/info/blockreward?stringOnly=false"),
    get("/info/halving"), get("/info/coinsupply"),
  ]);
  return {
    hashrateTh: hr?.hashrate ?? null,                      // TH/s
    blockReward: br?.blockreward ?? null,
    nextReduction: hv ? { at: hv.nextHalvingTimestamp * 1000, reward: hv.nextHalvingAmount } : null,
    circulating: cs ? Number(cs.circulatingSupply) / 1e8 : null,
    maxSupply: cs ? Number(cs.maxSupply) / 1e8 : null,
  };
}

function cached(key, ttl, fetcher, force) {
  return (async () => {
    if (!force) {
      try {
        const c = JSON.parse(localStorage.getItem(key));
        if (c && Date.now() - c.at < ttl) return c.data;
      } catch { /* fall through to fetch */ }
    }
    const data = await fetcher();
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* quota */ }
    return data;
  })();
}

// Daily closes for a comparison coin as [timestamp, close] pairs
export function loadPeerHistory(peer, { force = false } = {}) {
  return cached(`kas-signals-peer-${peer.sym}`, TTL_MS, async () => {
    if (peer.source.gate) return [...(await dailyCloses(peer.source.gate)).entries()].sort((a, b) => a[0] - b[0]);
    // Kraken returns the latest 720 daily candles: [time, open, high, low, close, ...]
    const d = await getJson(`https://api.kraken.com/0/public/OHLC?pair=${peer.source.kraken}&interval=1440`);
    if (d.error?.length) throw new Error(d.error.join(", "));
    const key = Object.keys(d.result).find((k) => k !== "last");
    return d.result[key].map((r) => [+r[0], +r[4]]).filter(([, c]) => c > 0);
  }, force);
}

// Market cap, rank, 1-year change and circulating supply from CoinGecko
export function loadMarketCaps(ids, { force = false } = {}) {
  return cached("kas-signals-mcaps", TTL_MS, async () => {
    const rows = await getJson("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd" +
      `&ids=${ids.join(",")}&price_change_percentage=1y`);
    return Object.fromEntries(rows.map((c) => [c.id, {
      mcap: c.market_cap, rank: c.market_cap_rank, price: c.current_price,
      change1y: c.price_change_percentage_1y_in_currency, circulating: c.circulating_supply,
    }]));
  }, force);
}

export async function loadMarket({ force = false } = {}) {
  if (!force) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (c && Date.now() - c.fetchedAt < TTL_MS) return c;
    } catch { /* storage unavailable or corrupt: fetch fresh */ }
  }
  const [kas, btc, fng, net] = await Promise.all([
    dailyCloses("KAS_USDT"), dailyCloses("BTC_USDT"), getJson(FNG).catch(() => null), network(),
  ]);
  const t = [...kas.keys()].filter((ts) => btc.has(ts)).sort((a, b) => a - b);
  const fngDays = (fng?.data || []).map((d) => [Math.floor(+d.timestamp / 86400), +d.value]);
  const m = {
    fetchedAt: Date.now(),
    t, kas: t.map((ts) => kas.get(ts)), btc: t.map((ts) => btc.get(ts)),
    fng: fng?.data?.[0] ? { value: +fng.data[0].value, label: fng.data[0].value_classification } : null,
    fngDays, net,
  };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(m)); } catch { /* quota or private mode */ }
  return m;
}
