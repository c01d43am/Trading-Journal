import { EquityChart } from "../EquityChart";
import { StatCard } from "../StatCard";
import { calculateProfileMetrics } from "../../data/profileMetrics";
import type { Profile, Trade } from "../../types";

const formatDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString();

export function BacktestingWidgets({
  profile,
  profileId,
  trades,
}: {
  profile: Profile;
  profileId: string;
  trades: Trade[];
}) {
  const details = profile.backtesting!;
  const scopedTrades = trades.filter((trade) => trade.profileId === profileId);
  const { metrics, equityCurve } = calculateProfileMetrics(profileId, details.capital, scopedTrades, profile.createdAt);

  return (
    <>
      <StatCard label="Pair" value={details.pair} detail="Backtesting instrument" tone="blue" />
      <StatCard label="Date range" value={`${formatDate(details.dateFrom)} – ${formatDate(details.dateTo)}`} detail="Selected test period" tone="blue" />
      <StatCard label="Capital" value={`$${details.capital.toLocaleString()}`} detail="Starting capital" tone="green" />
      <StatCard label="Balance" value={`$${metrics.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} detail="Starting capital + realized journal P&L" tone="blue" valueTone={metrics.balance >= details.capital ? "green" : "red"} />
      <StatCard label="Equity" value={`$${metrics.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} detail="Balance + open P&L" tone="purple" valueTone={metrics.equity >= details.capital ? "green" : "red"} />
      <StatCard label="Open P&L" value={`$${metrics.openPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} detail="No open trades recorded" tone="green" valueTone={metrics.openPnl >= 0 ? "green" : "red"} />
      <div className="col-span-full">
        <EquityChart points={equityCurve} currency="USD" subtitle="Starting capital plus recorded journal trades" />
      </div>
    </>
  );
}
