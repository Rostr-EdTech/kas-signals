// Networks to compare with Kaspa: data sources and simplified specs.
// Specs as of October 2026. Networks upgrade often: verify before quoting, and send corrections.

export const KASPA = {
  sym: "KAS", name: "Kaspa", gecko: "kaspa", color: "#49c5b6",
  specs: {
    consensus: "Proof-of-work (kHeavyHash), blockDAG (GHOSTDAG)",
    blockTime: "~0.1 s (10 blocks per second)",
    finality: "~10 s",
    programmability: "Covenants and native ZK verification (Toccata, 2026), KCC-20 tokens; vProgs in development",
    supply: "~28.7 billion max",
    launch: "Nov 2021, fair launch (no premine, no presale)",
    privacy: "Transparent (optional private payments on testnet)",
  },
};

export const PEERS = [
  {
    sym: "BTC", name: "Bitcoin", gecko: "bitcoin", color: "#f7931a", source: { gate: "BTC_USDT" },
    specs: {
      consensus: "Proof-of-work (SHA-256), single chain",
      blockTime: "~10 min",
      finality: "~60 min (6 blocks)",
      programmability: "Basic scripts",
      supply: "21 million max",
      launch: "Jan 2009, fair launch (no premine)",
      privacy: "Transparent",
    },
  },
  {
    sym: "ETH", name: "Ethereum", gecko: "ethereum", color: "#7b8cea", source: { gate: "ETH_USDT" },
    specs: {
      consensus: "Proof-of-stake (since 2022)",
      blockTime: "12 s",
      finality: "~13 min",
      programmability: "Full smart contracts (EVM); the largest app ecosystem",
      supply: "No fixed cap",
      launch: "2015, public crowdsale (ICO)",
      privacy: "Transparent",
    },
  },
  {
    sym: "SOL", name: "Solana", gecko: "solana", color: "#a259ff", source: { gate: "SOL_USDT" },
    specs: {
      consensus: "Proof-of-stake with Proof of History",
      blockTime: "~0.4 s",
      finality: "~13 s",
      programmability: "Full smart contracts; large app ecosystem",
      supply: "No fixed cap (declining inflation)",
      launch: "2020, private and public token sales",
      privacy: "Transparent",
    },
  },
  {
    sym: "ADA", name: "Cardano", gecko: "cardano", color: "#2f80ed", source: { gate: "ADA_USDT" },
    specs: {
      consensus: "Proof-of-stake (Ouroboros)",
      blockTime: "~20 s",
      finality: "Minutes (probabilistic)",
      programmability: "Smart contracts (Plutus, eUTXO)",
      supply: "45 billion max",
      launch: "2017, public presale",
      privacy: "Transparent",
    },
  },
  {
    sym: "XMR", name: "Monero", gecko: "monero", color: "#d6336c", source: { kraken: "XMRUSD" },
    specs: {
      consensus: "Proof-of-work (RandomX, CPU-friendly)",
      blockTime: "~2 min",
      finality: "~20 min (10 blocks)",
      programmability: "None (payments only)",
      supply: "No hard cap (small permanent tail emission)",
      launch: "2014, fair launch (no premine)",
      privacy: "Private by default",
    },
  },
];

// More tokens for portfolios and the Compare view (no spec rows in the networks table)
export const EXTRA_TOKENS = [
  { sym: "XRP", name: "XRP", gecko: "ripple", color: "#8fa3b8", source: { gate: "XRP_USDT" } },
  { sym: "BNB", name: "BNB", gecko: "binancecoin", color: "#f3ba2f", source: { gate: "BNB_USDT" } },
  { sym: "DOGE", name: "Dogecoin", gecko: "dogecoin", color: "#c2a633", source: { gate: "DOGE_USDT" } },
  { sym: "TRX", name: "TRON", gecko: "tron", color: "#ff7a59", source: { gate: "TRX_USDT" } },
  { sym: "LINK", name: "Chainlink", gecko: "chainlink", color: "#4f7df0", source: { gate: "LINK_USDT" } },
  { sym: "XLM", name: "Stellar", gecko: "stellar", color: "#5ec8e5", source: { gate: "XLM_USDT" } },
  { sym: "LTC", name: "Litecoin", gecko: "litecoin", color: "#a5b4d6", source: { gate: "LTC_USDT" } },
  { sym: "AVAX", name: "Avalanche", gecko: "avalanche-2", color: "#e84142", source: { gate: "AVAX_USDT" } },
  { sym: "SUI", name: "Sui", gecko: "sui", color: "#4da2ff", source: { gate: "SUI_USDT" } },
  { sym: "HBAR", name: "Hedera", gecko: "hedera-hashgraph", color: "#9a9a9a", source: { gate: "HBAR_USDT" } },
  { sym: "DOT", name: "Polkadot", gecko: "polkadot", color: "#e6007a", source: { gate: "DOT_USDT" } },
];

export const TOKENS = [...PEERS, ...EXTRA_TOKENS];

export const SPEC_ROWS = [
  ["consensus", "Consensus"],
  ["blockTime", "Block time"],
  ["finality", "Typical finality"],
  ["programmability", "Programmability"],
  ["supply", "Supply"],
  ["launch", "Launch"],
  ["privacy", "Privacy"],
];

// Shown under the comparison table. Keep it fair: credibility is what persuades.
export const SUMMARY = {
  standsOut: [
    "The only network here that combines proof-of-work security with block times under a second.",
    "Confirmation in about 10 seconds, versus about an hour for Bitcoin and 20 minutes for Monero.",
    "Fair launch with no premine or presale, like Bitcoin and Monero.",
    "New supply is shrinking every month, so issuance is ending sooner than for most networks.",
  ],
  othersLead: [
    "Ethereum and Solana: far larger app ecosystems, developer communities and liquidity.",
    "Bitcoin: the largest security budget, liquidity and institutional access.",
    "Monero: privacy by default.",
    "Kaspa's smart-contract layer is newer and still being built out.",
  ],
};
