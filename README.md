# KAS Signals

**Live:** [kaspa.rostr.one](https://kaspa.rostr.one) · Built by [Rostr EdTech](https://rostr.one)

A free, private dashboard for Kaspa (KAS) and Bitcoin (BTC) holders. It turns
trend, sentiment and the KAS/BTC ratio into a plan **you** set: your holdings,
your regular buys, your target allocation and your risk tolerance.

Everything runs in the browser. There is no server, no account, no cookies and no
tracking. Your settings are saved only in your own browser's local storage.

**Not financial advice.** Signals are historical tendencies from a few years of
data, not predictions.

## Features

- **Market signal**: buy-zone / neutral / greed warning / trim-zone conditions, with reasons.
- **This period's plan**: how to split your next regular buy between KAS and BTC.
  New money tilts toward whichever coin is relatively cheap (KAS/BTC RSI), and
  rebalancing toward your target allocation takes priority when you drift too far.
- **Your portfolio**: value, allocation vs. target, and how many regular buys it
  takes to rebalance without selling (selling is usually taxable).
- **Chart**: KAS price or KAS/BTC ratio, 20/50/200-day averages, buy/trim zones or
  the ratio's 90-day band, RSI, 3M to All, zoom (scroll / pinch) and pan (drag),
  hover readouts, log scale, and **Share image** for social posts.
- **Signal report card**: how *your* thresholds would have done on the full price
  history, recomputed in the browser whenever you change them.
- **Goal projection**: your holdings plus regular buys under four scenarios.
- **Other tokens**: add ETH, SOL, ADA, XMR, XRP, BNB, DOGE, TRX, LINK, XLM, LTC, AVAX, SUI, HBAR or DOT
  to your portfolio.
- **If recent trends continue**: projects every holding at its own 1, 2 or 3-year trend, plus your regular
  buys, and says when you'd reach your goal at those rates, with all three lookbacks side by side.
- **Donate button**: "Like this tool? ♥ Donate KAS" opens a donation panel. The suggested amount is
  100 KAS or $5 worth, whichever is less, adjustable with a slider (1 to 10,000 KAS) that shows the dollar
  value. The QR code is a live payment request (`kaspa:<address>?amount=<KAS>`) that updates with the
  slider, generated in the browser by `js/qr.js` (no outside library). "Open in wallet" passes the same
  request. Link straight to it with `?donate=1`, or suggest an amount with `?donate=250`.
- **Kaspa network & mining**: hashrate, emission, next monthly reward reduction,
  and a miner profitability calculator.
- **Compare view**: KAS against BTC, ETH, SOL, ADA and XMR, every line starting at 0% at the left edge of the
  visible range. Choose coins with the checkboxes. Coins with shorter history are labelled with their start date.
- **Kaspa vs other networks**: live market cap, rank and 1-year change, the KAS price at each network's market
  cap (arithmetic, not a forecast), and simplified technical specs, with a fair summary of where Kaspa stands
  out and where others lead. Specs live in `js/peers.js`, easy to correct or extend.
- **Guide**: how to use the tool and how to read every number, plus short explanations inside the cards.
- **Theme**: Auto (follows the system), Light or Dark, remembered per browser.
- **Risk profiles**: Conservative, Balanced (the backtested defaults) and Aggressive,
  with every threshold adjustable.

## Shareable links

| Link | Opens |
|---|---|
| `?view=ratio` | The KAS/BTC ratio view |
| `?view=compare` | The comparison view |
| `?range=3M` … `?range=All` | A time range (3M, 6M, 1Y, 2Y, 3Y, 5Y, All) |
| `?log=1` | Log scale |
| `?embed=1` | Compact card (signal + this period's plan) for embedding |
| `?donate=1` | Opens the donation panel |
| `?donate=250` | Opens it with 250 KAS suggested |

Combine them, e.g. `?view=ratio&range=All&log=1`.

## Embed on another site

```html
<iframe src="https://YOUR-SITE/?embed=1" width="420" height="520"
        style="border:0" title="KAS Signals"></iframe>
```

The embedded card uses the visitor's own settings from the full app, if any.

## Deployment (kaspa.rostr.one)

Cloudflare Pages, connected to this repository:

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | `mkdir -p dist && cp -r index.html css js img dist/` |
| Build output directory | `dist` |

The build step publishes only the app files, so `tests/` (development helpers) and `tools/` are not served.

## Publish your own copy (free)

It's a static site: any static host works.

1. Edit `js/config.js`: site name, URL (shown on shared images), repository link, the designer credit
   (`credit`: name, tagline, link and button text, shown under the title, in the footer, on shared images
   and on embedded cards; leave the name empty to hide it),
   and your KAS/BTC donation addresses (leave empty to hide the donation box).
   The donation QR code is generated in the page. `kasQr` (made with `tools/make_donation_qr.py`) is only
   a fallback image of the bare address.
2. Push the folder to a GitHub repository.
3. In the repository: **Settings → Pages → Deploy from a branch → main / root**.

Netlify, Cloudflare Pages and Vercel also work: drag-and-drop the folder or connect
the repository. There is no build step.

## Data sources

All requested directly by the visitor's browser (they allow cross-origin requests):

| Data | Source |
|---|---|
| Daily KAS/USDT and BTC/USDT closes | [Gate.io public API](https://www.gate.io/docs/developers/apiv4/) |
| Crypto Fear & Greed Index | [alternative.me](https://alternative.me/crypto/fear-and-greed-index/) (attribution required, shown in the footer) |
| Hashrate, block reward, next reduction, supply | [api.kaspa.org](https://api.kaspa.org) |
| Daily ETH, SOL, ADA closes | Gate.io public API |
| Daily XMR closes (about 2 years) | [Kraken public API](https://docs.kraken.com/api/) (most exchanges have delisted Monero) |
| Market cap, rank, 1-year change | [CoinGecko API](https://www.coingecko.com/en/api) |

Market data is cached in the browser for 30 minutes to stay gentle on these free APIs.
Check each provider's terms before heavy promotion.

## Development

No dependencies and no build step.

```bash
python3 -m http.server 8765          # then open http://127.0.0.1:8765/
node tests/test_strategy.mjs         # logic tests (Node 18+)
```

`tests/demo-seed.html` fills the browser's settings with sample values (not real
holdings) and opens the app, handy for screenshots and testing.

| File | What it does |
|---|---|
| `js/indicators.js` | Moving averages, RSI, log bands |
| `js/strategy.js` | Signals, buy plan, rebalancing, report card, projections, mining (pure functions, tested) |
| `js/data.js` | Fetching and caching market data |
| `js/chart.js` | Canvas chart with zoom, pan, hover and PNG export |
| `js/app.js` | The page: settings, cards, compare view, networks table, theme, guide, sharing, donations, embed mode |
| `js/peers.js` | Networks to compare: data sources, colors and simplified specs |
| `js/guide.js` | The in-app guide |
| `js/qr.js` | Small QR code generator for the donation request (byte mode, level M, versions 1-10) |
| `js/config.js` | Settings for whoever publishes the site |

## Where the default thresholds come from

A backtest of KAS daily data (March 2023 – October 2026):

- Moving-average crossovers did **worse** than random at catching +30% moves, so
  they are shown for context, not as triggers.
- Oversold RSI readings were the best (but rare) buying moments.
- Extreme greed came before the weakest 90-day returns.
- Swapping whole holdings between KAS and BTC on ratio signals did not beat holding
  BTC in both halves of the data. Tilting *new* purchases by the KAS/BTC RSI beat a
  fixed split by about 3–4% in both halves, with no sales.

The in-app report card recomputes these numbers live for your own thresholds.

## License

MIT (see `LICENSE`).
