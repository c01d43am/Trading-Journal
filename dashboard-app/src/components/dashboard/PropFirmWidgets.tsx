import { EquityChart } from "../EquityChart";
import { StatCard } from "../StatCard";
import { PairsWidget } from "./PairsWidget";
import { calculateProfileMetrics } from "../../data/profileMetrics";
import type { Profile, Trade } from "../../types";

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type RuleStatus = "OK" | "Warning" | "Breached";

function ruleStatus(usage: number): RuleStatus {
  if (usage >= 90) return "Breached";
  if (usage >= 70) return "Warning";
  return "OK";
}

function StatusPill({ label, usage }: { label: string; usage: number }) {
  const status = ruleStatus(usage);
  const styles: Record<RuleStatus, string> = {
    OK: "bg-emerald-400/10 text-emerald-300",
    Warning: "bg-amber-400/10 text-amber-300",
    Breached: "bg-rose-400/10 text-rose-300",
  };
  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${styles[status]}`}>
      {label}: {status} · {usage}% used
    </span>
  );
}

function TargetPill({ progress }: { progress: number }) {
  const reached = progress >= 100;
  return (
    <span className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
      Target: {reached ? "Reached" : "In progress"} · {Math.min(Math.round(progress), 100)}% achieved
    </span>
  );
}

export function PropFirmWidgets({
  profile,
  profileId,
  trades,
}: {
  profile: Profile;
  profileId: string;
  trades: Trade[];
}) {
  const account = profile.propfirm!;
  const scopedTrades = trades.filter((trade) => trade.profileId === profileId);
  const { metrics, equityCurve } = calculateProfileMetrics(profileId, account.capital, scopedTrades, profile.createdAt);
  const targetProgress = account.targetPct > 0
    ? Math.max(0, (metrics.netProfit / (account.capital * account.targetPct / 100)) * 100)
    : 0;
  const dailyLimit = account.capital * account.dailyDrawdownPct / 100;
  const maxLimit = account.capital * account.maxDrawdownPct / 100;
  const dailyUsage = dailyLimit > 0 ? Math.min((metrics.dailyDrawdown / dailyLimit) * 100, 100) : 0;
  const maxUsage = maxLimit > 0 ? Math.min((metrics.maxDrawdown / maxLimit) * 100, 100) : 0;
  const dailyRemainingPct = account.dailyDrawdownPct * (1 - dailyUsage / 100);
  const maxRemainingPct = account.maxDrawdownPct * (1 - maxUsage / 100);

  return (
    <>
      <StatCard label="Prop Firm" value={account.firmName} detail="Account provider" tone="purple" />
      <StatCard label="Phase" value={account.phase} detail="Current account phase" tone="purple" />
      <StatCard label="Capital" value={`$${account.capital.toLocaleString()}`} detail="Starting capital" tone="green" />
      <StatCard label="Balance" value={`$${formatCurrency(metrics.balance)}`} detail="Starting capital + realized journal P&L" tone="blue" valueTone={metrics.balance >= account.capital ? "green" : "red"} />
      <StatCard label="Equity" value={`$${formatCurrency(metrics.equity)}`} detail="Balance + open P&L" tone="purple" valueTone={metrics.equity >= account.capital ? "green" : "red"} />
      <StatCard label="Open P&L" value={`$${formatCurrency(metrics.openPnl)}`} detail="No open trades recorded" tone="green" valueTone={metrics.openPnl >= 0 ? "green" : "red"} />
      <PairsWidget trades={scopedTrades} />

      <section className="panel col-span-full">
        <h2 className="section-title mb-5">Compliance</h2>
        <div className="grid gap-5 md:grid-cols-3">
          <div>
            <div className="mb-2 flex justify-between gap-3 text-xs">
              <span className="font-medium text-slate-300">Progress to Target</span>
              <span className="text-emerald-300">{Math.min(targetProgress, 100).toFixed(1)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(targetProgress, 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">Target: {account.targetPct}%</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <p className="text-xs text-slate-500">Daily DD remaining</p>
            <strong className="mt-2 block text-lg text-emerald-300">{dailyRemainingPct.toFixed(2)}% · ${(dailyLimit * (1 - dailyUsage / 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
            <p className="mt-1 text-xs text-slate-500">of {account.dailyDrawdownPct}% allowed</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <p className="text-xs text-slate-500">Max DD remaining</p>
            <strong className="mt-2 block text-lg text-emerald-300">{maxRemainingPct.toFixed(2)}% · ${(maxLimit * (1 - maxUsage / 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
            <p className="mt-1 text-xs text-slate-500">of {account.maxDrawdownPct}% allowed</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <StatusPill label="Daily DD" usage={Math.round(dailyUsage)} />
          <StatusPill label="Max DD" usage={Math.round(maxUsage)} />
          <TargetPill progress={targetProgress} />
        </div>
      </section>

      <div className="col-span-full">
        <EquityChart points={equityCurve} currency="USD" color="#ba8aff" subtitle="Starting capital plus recorded journal trades" />
      </div>
    </>
  );
}
