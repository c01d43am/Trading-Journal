import type { EquityPoint, Trade } from "../types";

export interface ProfileMetrics {
  netProfit: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  balance: number;
  openPnl: number;
  equity: number;
}

export function calculateProfileMetrics(
  profileId: string,
  startingCapital: number,
  trades: Trade[],
  startingAt?: string,
): { equityCurve: EquityPoint[]; metrics: ProfileMetrics } {
  const scopedTrades = trades
    .filter((trade) => trade.profileId === profileId)
    .slice()
    .sort((left, right) =>
      `${left.date}T${left.time ?? "00:00:00"}`.localeCompare(
        `${right.date}T${right.time ?? "00:00:00"}`,
      ),
    );
  let balance = startingCapital;
  let peak = startingCapital;
  let maxDrawdown = 0;
  let activeDate = "";
  let dailyPeak = startingCapital;
  let dailyDrawdown = 0;
  const firstTrade = scopedTrades[0];
  const equityCurve: EquityPoint[] = [{
    profileId,
    label: "Start",
    value: startingCapital,
    timestamp: startingAt ?? (firstTrade ? `${firstTrade.date}T${firstTrade.time ?? "00:00:00"}` : new Date().toISOString()),
  }];

  for (const trade of scopedTrades) {
    if (trade.date !== activeDate) {
      activeDate = trade.date;
      dailyPeak = balance;
    }
    balance += trade.pnl;
    peak = Math.max(peak, balance);
    maxDrawdown = Math.max(maxDrawdown, peak - balance);
    dailyPeak = Math.max(dailyPeak, balance);
    dailyDrawdown = Math.max(dailyDrawdown, dailyPeak - balance);
    equityCurve.push({
      profileId,
      label: trade.time ? `${trade.date} ${trade.time}` : trade.date,
      value: Math.round(balance * 100) / 100,
      timestamp: `${trade.date}T${trade.time ?? "00:00:00"}`,
    });
  }

  const netProfit = scopedTrades.reduce((total, trade) => total + trade.pnl, 0);
  const roundedBalance = Math.round(balance * 100) / 100;
  const openPnl = 0;
  const equity = roundedBalance;
  equityCurve.push({
    profileId,
    label: "Current",
    value: equity,
    timestamp: new Date().toISOString(),
  });
  return {
    equityCurve,
    metrics: {
      netProfit: Math.round(netProfit * 100) / 100,
      dailyDrawdown: Math.round(dailyDrawdown * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      balance: roundedBalance,
      openPnl,
      equity,
    },
  };
}
