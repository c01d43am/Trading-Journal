export interface FeaturedPair {
  market: string;
  pair: string;
  name: string;
  aliases?: string[];
  recommended?: boolean;
}

export const FEATURED_PAIRS: FeaturedPair[] = [
  { market: "Forex · Major Pairs", pair: "EUR/USD", name: "Euro / US Dollar", aliases: ["EU"], recommended: true },
  { market: "Forex · Major Pairs", pair: "GBP/USD", name: "British Pound / US Dollar", aliases: ["GU"], recommended: true },
  { market: "Forex · Major Pairs", pair: "USD/JPY", name: "US Dollar / Japanese Yen", aliases: ["UJ"] },
  { market: "Forex · Major Pairs", pair: "USD/CHF", name: "US Dollar / Swiss Franc", aliases: ["UC"] },
  { market: "Forex · Major Pairs", pair: "AUD/USD", name: "Australian Dollar / US Dollar", aliases: ["AU"], recommended: true },
  { market: "Forex · Major Pairs", pair: "NZD/USD", name: "New Zealand Dollar / US Dollar", aliases: ["NU"], recommended: true },
  { market: "Forex · Major Pairs", pair: "USD/CAD", name: "US Dollar / Canadian Dollar", aliases: ["UCAD"] },
  { market: "Forex · Minor Pairs", pair: "EUR/GBP", name: "Euro / British Pound" },
  { market: "Forex · Minor Pairs", pair: "EUR/JPY", name: "Euro / Japanese Yen" },
  { market: "Forex · Minor Pairs", pair: "GBP/JPY", name: "British Pound / Japanese Yen" },
  { market: "Forex · Minor Pairs", pair: "EUR/AUD", name: "Euro / Australian Dollar" },
  { market: "Forex · Minor Pairs", pair: "EUR/NZD", name: "Euro / New Zealand Dollar" },
  { market: "Forex · Minor Pairs", pair: "GBP/AUD", name: "British Pound / Australian Dollar" },
  { market: "Forex · Minor Pairs", pair: "GBP/NZD", name: "British Pound / New Zealand Dollar" },
  { market: "Forex · Minor Pairs", pair: "AUD/JPY", name: "Australian Dollar / Japanese Yen" },
  { market: "Forex · Minor Pairs", pair: "NZD/JPY", name: "New Zealand Dollar / Japanese Yen" },
  { market: "Forex · Minor Pairs", pair: "AUD/NZD", name: "Australian Dollar / New Zealand Dollar" },
  { market: "Commodities · Metals", pair: "XAU/USD", name: "Gold", recommended: true },
  { market: "Commodities · Metals", pair: "XAG/USD", name: "Silver", recommended: true },
  { market: "Commodities · Metals", pair: "XPT/USD", name: "Platinum" },
  { market: "Commodities · Metals", pair: "XPD/USD", name: "Palladium" },
  { market: "Oil & Energy", pair: "USOIL", name: "US Crude Oil (WTI)", recommended: true },
  { market: "Oil & Energy", pair: "UKOIL", name: "Brent Crude Oil", recommended: true },
  { market: "Oil & Energy", pair: "NATGAS", name: "Natural Gas" },
  { market: "Cryptocurrency", pair: "BTC/USD", name: "Bitcoin", recommended: true },
  { market: "Cryptocurrency", pair: "ETH/USD", name: "Ethereum", recommended: true },
  { market: "Cryptocurrency", pair: "BNB/USD", name: "Binance Coin" },
  { market: "Cryptocurrency", pair: "SOL/USD", name: "Solana" },
  { market: "Cryptocurrency", pair: "XRP/USD", name: "Ripple" },
  { market: "Cryptocurrency", pair: "LINK/USD", name: "Chainlink" },
];

export const CUSTOM_PAIR_VALUE = "__custom_pair__";

export function isFeaturedPair(value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  return FEATURED_PAIRS.some((item) =>
    item.pair.toLocaleLowerCase() === normalized
    || item.pair.toLocaleLowerCase().replace(/[^a-z0-9]/g, "") === compact
    || item.aliases?.some((alias) => alias.toLocaleLowerCase() === normalized),
  );
}

export function normalizeFeaturedPair(value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  return FEATURED_PAIRS.find((item) =>
    item.pair.toLocaleLowerCase() === normalized
    || item.pair.toLocaleLowerCase().replace(/[^a-z0-9]/g, "") === compact
    || item.aliases?.some((alias) => alias.toLocaleLowerCase() === normalized),
  )?.pair;
}
