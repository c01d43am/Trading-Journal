import type { Profile, Trade } from "../types";

export function isTradeWithinProfileRange(
  profile: Profile | undefined,
  trade: Pick<Trade, "date">,
) {
  if (profile?.mode !== "backtesting" || !profile.backtesting) return true;
  const date = trade.date.slice(0, 10);
  return date >= profile.backtesting.dateFrom && date <= profile.backtesting.dateTo;
}

export function isTradeForProfilePair(
  profile: Profile | undefined,
  trade: Pick<Trade, "symbol">,
) {
  if (profile?.mode !== "backtesting" || !profile.backtesting) return true;
  return trade.symbol.trim().toLocaleLowerCase() === profile.backtesting.pair.trim().toLocaleLowerCase();
}

export function filterTradesForProfile(profile: Profile | undefined, trades: Trade[]) {
  return profile?.mode === "backtesting"
    ? trades.filter((trade) => isTradeWithinProfileRange(profile, trade) && isTradeForProfilePair(profile, trade))
    : trades;
}
