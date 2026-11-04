import { EquityChart } from "../EquityChart";
import { StatCard } from "../StatCard";
import { PairsWidget } from "./PairsWidget";
import { calculateProfileMetrics } from "../../data/profileMetrics";
import type { Profile, Trade } from "../../types";

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BrokerWidgets({
  profile,
  profileId,
  trades,
}: {
  profile: Profile;
  profileId: string;
  trades: Trade[];
}) {
  const account = profile.broker!;
  const scopedTrades = trades.filter((trade) => trade.profileId === profileId);
  const { metrics, equityCurve } = calculateProfileMetrics(profileId, account.capital, scopedTrades, profile.createdAt);
  const { balance, openPnl, equity } = metrics;

  return (
    <>
      <StatCard label="Broker" value={account.brokerName} detail="Broker name" tone="green" />
      <StatCard label="Capital" value={`$${account.capital.toLocaleString()}`} detail="Starting capital" tone="green" />
      <StatCard label="Balance" value={`$${formatCurrency(balance)}`} detail="Starting capital + realized journal P&L" tone="blue" valueTone={balance >= account.capital ? "green" : "red"} />
      <StatCard label="Equity" value={`$${formatCurrency(equity)}`} detail="Balance + open P&L" tone="purple" valueTone={equity >= account.capital ? "green" : "red"} />
      <StatCard label="Open P&L" value={`$${formatCurrency(openPnl)}`} detail="No open trades recorded" tone="green" valueTone={openPnl >= 0 ? "green" : "red"} />
      <PairsWidget trades={scopedTrades} />
      <div className="col-span-full">
        <EquityChart points={equityCurve} currency="USD" color="#62d9a5" title="Equity curve" subtitle="Starting capital plus recorded journal trades" />
      </div>
    </>
  );
}
