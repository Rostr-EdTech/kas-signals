// Guide content: how to use the tool and how to read each part. Sections have ids for deep links.
export const GUIDE = `
<p>KAS Signals turns market data into a plan for <b>your</b> holdings and regular buys. It doesn't predict
prices: it shows conditions that historically came before better or worse periods, and what your own
rules say to do about them.</p>

<h3 id="g-start">1. Getting started</h3>
<ul>
  <li>Open <b>Your plan</b> and enter what you hold, how much you buy and how often, how you usually split
    it between KAS and BTC, your target KAS share of the portfolio, and a risk profile.</li>
  <li>Everything is saved only in this browser. Nothing is sent anywhere, and there is no account.</li>
  <li>Market data refreshes every 30 minutes while the page is open, or when you press <b>Refresh</b>.</li>
</ul>

<h3 id="g-signal">2. Market signal</h3>
<ul>
  <li><b>Buy-zone conditions</b> (green): KAS is oversold (low RSI) or far below its 200-day average.
    Historically, sharp rebounds were a bit more common afterward, though prices often kept sliding for a while.</li>
  <li><b>Neutral</b> (blue): nothing unusual. Stick to your regular plan.</li>
  <li><b>Greed warning</b> (orange): either sentiment is extreme (Fear &amp; Greed index) or the price is far above its trend.</li>
  <li><b>Trim-zone conditions</b> (red): both at once. Historically weak periods followed.</li>
  <li>The <b>backdrop</b> line says whether Bitcoin is above its 200-day average. KAS jumps were almost twice
    as likely when it was.</li>
  <li>Your risk profile sets how far is "far": Conservative waits for deeper dips and trims earlier;
    Aggressive buys dips sooner and lets gains run longer. You can fine-tune each threshold.</li>
</ul>

<h3 id="g-plan">3. This period's plan</h3>
<ul>
  <li>How to split your next regular buy between KAS and BTC.</li>
  <li>Normally it's your usual split. When KAS is unusually <b>cheap compared with BTC</b> (low KAS/BTC RSI),
    new money tilts to KAS; when it's unusually <b>expensive</b>, it tilts to BTC.</li>
  <li>If your portfolio has drifted outside your target band, rebalancing comes first: all new money goes to
    the underweight coin.</li>
  <li>On buy-zone signals, your optional <b>extra budget</b> is suggested for KAS. On trim-zone signals, it
    suggests selling the percentage your profile sets. Selling is usually a taxable event.</li>
</ul>

<h3 id="g-portfolio">4. Your portfolio</h3>
<ul>
  <li>The bar shows your KAS share (teal) against BTC; the black mark is your target.</li>
  <li>When you drift outside the band, it says how many regular buys it takes to get back with no sales and no
    tax, and, if that would take over about 6 months, how much you would have to sell to rebalance at once.</li>
  <li>Add <b>other tokens</b> (ETH, SOL, XMR, ADA, XRP and more) under Your plan. They count in your total
    and the color bar; rebalancing guidance still covers only the KAS/BTC part.</li>
  <li>Update your holdings after you buy so this stays accurate.</li>
</ul>

<h3 id="g-trends">4b. If recent trends continue</h3>
<ul>
  <li>Grows each holding at its own average yearly change over the last 1, 2 or 3 years (you choose), adds
    your regular KAS/BTC buys, and projects 1, 3 or 5 years ahead or to your goal date.</li>
  <li>If you set a goal, it also says <b>when you'd reach it</b> at those rates.</li>
  <li>The line under the table shows your total under all three lookbacks. If they differ a lot, the
    projection depends heavily on which past period you pick, which is usually the case in crypto.</li>
  <li>One coin with a big recent run (or crash) can dominate the result after a few years of compounding.
    Read it as "what the recent past implies", not a forecast.</li>
</ul>

<h3 id="g-chart">5. The chart</h3>
<ul>
  <li><b>KAS price</b>: the price with its 20-day (amber), 50-day (blue) and 200-day (purple) averages, your
    buy zone (green) and trim zone (red), and RSI in the lower panel (below 30 oversold, above 70 overbought).</li>
  <li><b>KAS/BTC ratio</b>: the KAS price measured in BTC (sats). Rising means KAS is beating BTC. The band is
    the 90-day normal range: below it KAS is unusually cheap vs BTC, above it unusually expensive. The lower
    panel is the ratio's RSI, which drives your buy tilt.</li>
  <li><b>Compare</b>: KAS against other major coins. Every line starts at 0% at the left edge of the visible
    range, so you see who gained or lost the most over exactly that period. Pick coins with the checkboxes.</li>
  <li>Scroll or pinch to zoom, drag to pan, hover (or tap) for exact values. <b>Log scale</b> makes a 50% move
    look the same size at any price, which is best for long ranges.</li>
  <li><b>Share image</b> saves the current view as a picture for social media.</li>
  <li>Moving averages lag. In the KAS backtest, crossovers (like the "golden cross") did worse than random at
    catching jumps: use them to read the trend, not to time trades.</li>
</ul>

<h3 id="g-report">6. Signal report card</h3>
<p>It answers: "if I had followed these exact thresholds over the full price history, what usually happened next?"</p>
<ul>
  <li><b>Times</b>: how many separate occasions the condition was met. Several days in a row count once;
    a new occasion needs a 20-day gap.</li>
  <li><b>+30% within 30d</b>: of those occasions, how often KAS rose at least 30% above that day's price at
    some point in the next 30 days. It measures the chance of a sharp jump soon after.</li>
  <li><b>Median 90d</b>: the typical price change 90 days later. Half the occasions did better, half worse.</li>
  <li><b>Any day (baseline)</b>: the same numbers for every day. A signal is only useful if it beats this.</li>
  <li><b>Example</b>: if the baseline shows 23% / −9% and your buy-zone row shows 29% / −15%, then after
    buy-zone signals a sharp bounce was somewhat more likely than on a random day, but over three months the
    price usually kept sliding. That makes them better for an extra buy than for expecting a quick turnaround.</li>
  <li><b>Tilt vs fixed split</b>: the same money on the same schedule, either always split your usual way
    (fixed) or tilted to whichever coin was cheap vs the other. Each number is what $100 invested became. If both
    are under $100, the period lost money and the tilt simply lost less. The two halves check that it worked
    consistently, not just once.</li>
  <li>Few occasions means weak evidence, and most of the history is one long downtrend. Change a threshold in
    Your plan and the report card recomputes instantly.</li>
</ul>

<h3 id="g-goal">7. Goal projection</h3>
<ul>
  <li>It answers: <b>what would my portfolio be worth on my goal date?</b> It doesn't calculate when you would
    reach the goal.</li>
  <li>It starts from your holdings at today's prices, grows each coin at a steady yearly rate for four
    scenarios (Bear, Flat, Moderate, Strong), and adds every regular buy on schedule.</li>
  <li>It leaves out real price swings (much larger than a steady rate), your tilts, extra buys and rebalancing.
    Treat it as a rough guide to what pace of growth your goal needs.</li>
</ul>

<h3 id="g-networks">8. Kaspa vs other networks</h3>
<ul>
  <li>Live market cap, rank and 1-year change, plus the main technical differences.</li>
  <li><b>KAS price at their market cap</b> is arithmetic: their market cap divided by KAS's circulating supply.
    It shows scale, not a forecast.</li>
  <li>The comparison is deliberately fair, including where other networks lead. That's what makes it convincing
    to people who don't hold KAS.</li>
</ul>

<h3 id="g-mining">9. Network &amp; mining</h3>
<ul>
  <li>Live hashrate, block reward, daily emission, and the countdown to the next monthly reward reduction.</li>
  <li>The calculator estimates what a miner earns and its break-even electricity price, before pool fees and
    downtime. Rewards shrink every month and the network's hashrate changes daily.</li>
</ul>

<h3 id="g-privacy">10. Privacy and limits</h3>
<ul>
  <li>No cookies, tracking or accounts. Your plan stays in this browser; clearing site data erases it.</li>
  <li>Data comes straight from public sources (listed in the footer) to your browser.</li>
  <li><b>Not financial advice.</b> Signals are historical tendencies from a few years of data, not predictions.
    Selling or swapping crypto is usually a taxable event.</li>
</ul>
`;
