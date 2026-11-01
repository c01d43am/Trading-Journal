import type { Profile, Trade } from "../types";

export function isTradeWithinProfileRange(
  profile: Profile | undefined,
  trade: Pick<Trade, "date">,
) {
  if (profile?.mode !== "backtesting" || !profile.backtesting) return true;
  const date = trade.date.slice(0, 10);
  return date >= profile.backtesting.dateFrom && date <= profile.backtesting.dateTo;
}

export function filterTradesForProfile(profile: Profile | undefined, trades: Trade[]) {
  return profile?.mode === "backtesting"
    ? trades.filter((trade) => isTradeWithinProfileRange(profile, trade))
    : trades;
}
