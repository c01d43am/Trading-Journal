import { format, parseISO } from "date-fns";
import { useMemo, useState } from "react";
import { Journal } from "../Journal";
import type { Profile, Trade } from "../../types";
import {
  AccountBalanceChart,
  InstrumentProfitChart,
  InstrumentVolumeChart,
  TradeOutcomesChart,
} from "./PlatformCharts";
import { TradingHistory } from "./TradingHistory";
import { PlatformIcon } from "./platformIcons";
import "../../platform-dashboard.css";

type DialogKind = "share" | "faq" | null;
type RangePreset = "Last 7 days" | "Last 30 days" | "This month";

interface PropTradingDashboardProps {
  profile: Profile;
  onEditProfile: () => void;
  onSwitchProfile: () => void;
  onNewProfile: () => void;
  onDeleteProfile: () => void;
  trades: Trade[];
  onAddTrade: (trade: Omit<Trade, "profileId">) => void;
  onDeleteTrade: (tradeId: string) => void;
  onClearTrades: () => void;
}

const summaryIcons = [
  { label: "Account size", icon: "shield", tone: "blue" },
  { label: "Today's profit", icon: "chart", tone: "green" },
  { label: "Start date", icon: "calendar", tone: "violet" },
  { label: "Total trades", icon: "clock", tone: "neutral" },
] as const;

function currency(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function localDateKey(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getTradeStats(trades: Trade[], capital: number) {
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const grossProfit = wins.reduce((total, trade) => total + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((total, trade) => total + trade.pnl, 0));
  const dailyPnl = trades
    .filter((trade) => trade.date.slice(0, 10) === localDateKey())
    .reduce((total, trade) => total + trade.pnl, 0);
  const tradingDays = new Set(trades.map((trade) => trade.date.slice(0, 10))).size;
  const bySide = {
    Long: trades.filter((trade) => trade.side === "Long").reduce((total, trade) => total + trade.pnl, 0),
    Short: trades.filter((trade) => trade.side === "Short").reduce((total, trade) => total + trade.pnl, 0),
  };
  let balance = capital;
  let peak = capital;
  let maxDrawdown = 0;
  for (const trade of trades.slice().sort((left, right) =>
    `${left.date} ${left.time ?? ""}`.localeCompare(`${right.date} ${right.time ?? ""}`),
  )) {
    balance += trade.pnl;
    peak = Math.max(peak, balance);
    maxDrawdown = Math.max(maxDrawdown, peak - balance);
  }
  return {
    balance: capital + trades.reduce((total, trade) => total + trade.pnl, 0),
    dailyPnl,
    wins,
    losses,
    grossProfit,
    grossLoss,
    winRate: trades.length ? wins.length / trades.length * 100 : 0,
    averageWin: wins.length ? grossProfit / wins.length : 0,
    averageLoss: losses.length ? -grossLoss / losses.length : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : undefined,
    tradingDays,
    totalLots: trades.reduce((total, trade) => total + (trade.size ?? 0), 0),
    biggestWin: wins.length ? Math.max(...wins.map((trade) => trade.pnl)) : undefined,
    biggestLoss: losses.length ? Math.min(...losses.map((trade) => trade.pnl)) : undefined,
    bySide,
    maxDrawdown,
  };
}

function ProgressTrack({ value, tone = "blue" }: { value: number; tone?: "blue" | "green" | "red" }) {
  return (
    <div className={`platform-progress platform-progress-${tone}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function HalfDonut({
  title,
  amount,
  caption,
  progress,
  tone,
}: {
  title: string;
  amount: string;
  caption: string;
  progress: number;
  tone: "green" | "blue" | "red";
}) {
  const circumference = 250;
  return (
    <div className="platform-donut">
      <h4>{title}</h4>
      <svg viewBox="0 0 200 116" role="img" aria-label={`${title}: ${amount}`}>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#28303c" strokeWidth="13" strokeLinecap="round" />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={tone === "green" ? "#22c55e" : tone === "red" ? "#ef4444" : "#3b82f6"}
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={`${circumference * progress / 100} ${circumference}`}
        />
      </svg>
      <strong className={tone === "green" ? "is-positive" : tone === "red" ? "is-negative" : ""}>{amount}</strong>
      <span>{caption}</span>
    </div>
  );
}

function Dialog({
  kind,
  onClose,
}: {
  kind: Exclude<DialogKind, null>;
  onClose: () => void;
}) {
  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      window.prompt("Copy this dashboard link:", window.location.href);
    }
  };
  const title = kind === "faq" ? "Account FAQ" : "Share account";
  return (
    <div className="platform-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="platform-dialog" role="dialog" aria-modal="true" aria-labelledby="platform-dialog-title">
        <button className="platform-dialog-close" type="button" aria-label="Close dialog" onClick={onClose}>×</button>
        <span className="platform-dialog-icon"><PlatformIcon name={kind === "faq" ? "help" : "share"} size={19} /></span>
        <h2 id="platform-dialog-title">{title}</h2>
        {kind === "share" && (
          <>
            <p>Share a link to this account dashboard.</p>
            <div className="platform-share-link">{window.location.href}</div>
            <button className="platform-button platform-button-primary platform-dialog-action" type="button" onClick={copyShareLink}>
              <PlatformIcon name="copy" size={15} /> Copy dashboard link
            </button>
          </>
        )}
        {kind === "faq" && (
          <div className="platform-faq">
            <h3>When does the daily loss reset?</h3><p>Daily limits reset at the platform's stated end-of-day time. The countdown is displayed in Trading Objectives.</p>
            <h3>How is equity calculated?</h3><p>Equity includes the account balance and any unrealized profit or loss from open positions.</p>
            <h3>Where is this data stored?</h3><p>Trades are saved locally in this browser and kept separate for each profile.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function DailyLossObjective({
  dailyLimit,
  dailyPnl,
}: {
  dailyLimit: number;
  dailyPnl: number;
}) {
  const dailyLoss = Math.max(0, -dailyPnl);
  const remaining = Math.max(0, dailyLimit - dailyLoss);
  const usage = dailyLimit ? Math.min(100, dailyLoss / dailyLimit * 100) : 0;
  const status = dailyLimit === 0 ? "Not set" : dailyLoss >= dailyLimit ? "Limit reached" : "On track";
  return (
    <article className="platform-objective-card">
      <div className="platform-objective-heading">
        <span className="platform-objective-icon objective-blue"><PlatformIcon name="shield" /></span>
        <div><h3>Maximum daily loss</h3><p>Daily drawdown limit</p></div>
        <span className={`platform-objective-status ${dailyLimit > 0 && dailyLoss >= dailyLimit ? "status-warning" : "status-safe"}`}>{status}</span>
      </div>
      <div className="platform-objective-primary">
        <span>Remaining today</span>
        <strong>{currency(remaining)}</strong>
        <small>Based on today's recorded trades</small>
      </div>
      <ProgressTrack value={usage} tone={dailyLoss >= dailyLimit ? "red" : "blue"} />
      <div className="platform-objective-details">
        <span>Today's P&amp;L<strong className={dailyPnl >= 0 ? "is-positive" : "is-negative"}>{currency(dailyPnl)}</strong></span>
        <span>Daily loss used<strong>{currency(dailyLoss)}</strong></span>
        <span>Max allowed<strong>{currency(dailyLimit)}</strong></span>
        <span>Limit used<strong>{usage.toFixed(1)}%</strong></span>
      </div>
    </article>
  );
}

function MaximumLossObjective({
  maxLimit,
  maxDrawdown,
}: {
  maxLimit: number;
  maxDrawdown: number;
}) {
  const remaining = Math.max(0, maxLimit - maxDrawdown);
  const usage = maxLimit ? Math.min(100, maxDrawdown / maxLimit * 100) : 0;
  return (
    <article className="platform-objective-card">
      <div className="platform-objective-heading">
        <span className="platform-objective-icon objective-violet"><PlatformIcon name="chart" /></span>
        <div><h3>Maximum loss</h3><p>Overall account drawdown</p></div>
        <span className={`platform-objective-status ${maxLimit > 0 && maxDrawdown >= maxLimit ? "status-warning" : "status-safe"}`}>
          {maxLimit === 0 ? "Not set" : maxDrawdown >= maxLimit ? "Limit reached" : "On track"}
        </span>
      </div>
      <div className="platform-objective-primary">
        <span>Remaining</span>
        <strong>{currency(remaining)}</strong>
        <small>remaining of {currency(maxLimit)}</small>
      </div>
      <ProgressTrack value={usage} tone={maxDrawdown >= maxLimit ? "red" : "green"} />
      <div className="platform-objective-details">
        <span>Largest recorded drawdown<strong>{currency(maxDrawdown)}</strong></span>
        <span>Max allowed loss<strong>{currency(maxLimit)}</strong></span>
      </div>
    </article>
  );
}

function ProfitTargetObjective({ profit, target }: { profit: number; target: number }) {
  const progress = target > 0 ? Math.max(0, Math.min(100, profit / target * 100)) : 0;
  return (
    <article className="platform-objective-card">
      <div className="platform-objective-heading">
        <span className="platform-objective-icon objective-green"><PlatformIcon name="arrow-up-right" /></span>
        <div><h3>Profit target</h3><p>Reach your challenge goal</p></div>
        <span className="platform-objective-percent">{progress.toFixed(1)}%</span>
      </div>
      <div className="platform-objective-primary">
        <span>Profit achieved</span>
        <strong>{currency(profit)} <small>of {currency(target)}</small></strong>
      </div>
      <ProgressTrack value={progress} tone="green" />
      <div className="platform-objective-footnote">Complete the target to pass this phase.</div>
    </article>
  );
}

function TradingDaysObjective({ tradingDays }: { tradingDays: number }) {
  return (
    <article className="platform-objective-card platform-passed-card">
      <div className="platform-objective-heading">
        <span className="platform-objective-icon objective-green"><PlatformIcon name="check" /></span>
        <div><h3>Minimum trading days</h3><p>Required trading activity</p></div>
        <span className="platform-objective-status status-safe">{tradingDays} days</span>
      </div>
      <div className="platform-passed-copy"><strong>{tradingDays} trading days</strong><span>Number of distinct days with recorded trades.</span></div>
    </article>
  );
}

export function PropTradingDashboard({
  profile,
  onEditProfile,
  onSwitchProfile,
  onNewProfile,
  onDeleteProfile,
  trades,
  onAddTrade,
  onDeleteTrade,
  onClearTrades,
}: PropTradingDashboardProps) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [dateRange, setDateRange] = useState<RangePreset>("Last 30 days");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [monthToast, setMonthToast] = useState("");
  const capital = profile.mode === "propfirm"
    ? profile.propfirm?.capital ?? 0
    : profile.broker?.capital ?? 0;
  const stats = useMemo(() => getTradeStats(trades, capital), [trades, capital]);
  const summaryValues = [
    currency(capital),
    currency(stats.dailyPnl),
    Number.isNaN(Date.parse(profile.createdAt)) ? "—" : format(parseISO(profile.createdAt), "MMM d, yyyy"),
    String(trades.length),
  ];
  const advancedCards = [
    { label: "Trading days", value: String(stats.tradingDays), detail: "Days with saved trades" },
    { label: "Total trades", value: String(trades.length), detail: "Saved closed positions" },
    { label: "Total lots", value: stats.totalLots.toLocaleString(undefined, { maximumFractionDigits: 2 }), detail: "Recorded position size" },
    { label: "Biggest win", value: stats.biggestWin === undefined ? "—" : currency(stats.biggestWin), detail: "Best saved trade", tone: "is-positive" },
    { label: "Biggest loss", value: stats.biggestLoss === undefined ? "—" : currency(stats.biggestLoss), detail: "Worst saved trade", tone: "is-negative" },
  ];

  function showToast(message: string) {
    setMonthToast(message);
    window.setTimeout(() => setMonthToast(""), 3000);
  }

  async function shareDashboard() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Dashboard link copied to clipboard.");
    } catch {
      setDialog("share");
    }
  }

  function scrollToJournal() {
    document.getElementById("journal-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const firmName = profile.mode === "propfirm"
    ? profile.propfirm?.firmName || "Atlas Funded"
    : profile.broker?.brokerName || "Atlas Markets";
  const phase = profile.mode === "propfirm" ? profile.propfirm?.phase || "Phase 1" : "Live Account";
  const profileAccountId = profile.id.slice(-8).toUpperCase();
  const dailyLimit = profile.propfirm
    ? capital * profile.propfirm.dailyDrawdownPct / 100
    : undefined;
  const maxLimit = profile.propfirm
    ? capital * profile.propfirm.maxDrawdownPct / 100
    : undefined;
  const profitTarget = profile.propfirm
    ? capital * profile.propfirm.targetPct / 100
    : undefined;

  return (
    <main className="platform-dashboard">
      <div className="platform-page-topline">
        <nav className="platform-breadcrumbs" aria-label="Breadcrumb">
          <button type="button" onClick={onSwitchProfile}>Home</button><span>/</span><span>Accounts</span><span>/</span><strong>#{profileAccountId}</strong>
        </nav>
        <span className="platform-live-indicator"><i /> Account overview</span>
      </div>

      <header className="platform-account-header">
        <div className="platform-account-identity">
          <div className="platform-firm-logo" aria-label={`${firmName} placeholder logo`}>A<span>F</span></div>
          <div>
            <div className="platform-account-title-row"><h1>{firmName}</h1><span className="platform-account-id">#{profileAccountId}</span></div>
            <p>{profile.name} <span className="platform-dot-separator">·</span> Created {summaryValues[2]}</p>
          </div>
        </div>
        <div className="platform-account-actions">
          <button className="platform-button platform-button-primary" type="button" onClick={scrollToJournal}>
            Add trade
          </button>
          <button className="platform-button platform-button-quiet" type="button" onClick={shareDashboard}><PlatformIcon name="share" size={15} /> Share</button>
          <button className="platform-button platform-button-quiet" type="button" onClick={() => setDialog("faq")}><PlatformIcon name="help" size={15} /> FAQ</button>
          <div className="platform-profile-actions">
            <button type="button" onClick={onEditProfile}>Edit</button><button type="button" onClick={onSwitchProfile}>Switch</button><button type="button" onClick={onNewProfile}>New</button><button className="platform-danger-text" type="button" onClick={onDeleteProfile}>Delete</button>
          </div>
        </div>
      </header>

      <div className="platform-status-row">
        <span className="platform-status-pill">Local account</span>
        {profile.mode === "propfirm" && <span className="platform-status-pill">{phase}</span>}
      </div>

      <section className="platform-summary-grid" aria-label="Account summary">
        {summaryIcons.map((card, index) => (
          <article className="platform-summary-card" key={card.label}>
            <span className={`platform-summary-icon tone-${card.tone}`}><PlatformIcon name={card.icon} size={17} /></span>
            <div><p>{card.label}</p><strong className={index === 1 ? (stats.dailyPnl >= 0 ? "is-positive" : "is-negative") : ""}>{summaryValues[index]}</strong><small>{["Profile capital", "Realized today", "Profile created", "Saved to this profile"][index]}</small></div>
          </article>
        ))}
      </section>

      <section className="platform-overview-grid">
        <article className="platform-panel platform-score-panel">
          <div className="platform-section-heading">
            <div><span className="platform-kicker">TRADER PERFORMANCE</span><h2>Trade outcomes</h2></div>
            <button className="platform-icon-button" type="button" aria-label="Score details" onClick={() => setDialog("faq")}><PlatformIcon name="help" size={15} /></button>
          </div>
          <div className="platform-score-content">
            <div className="platform-score-value"><span>WIN RATE</span><strong>{stats.winRate.toFixed(1)}%</strong><small>{stats.wins.length} wins · {stats.losses.length} losses</small></div>
            <div className="platform-radar-wrap"><TradeOutcomesChart trades={trades} /></div>
          </div>
          <div className="platform-score-legend"><span><i className="legend-blue" /> Wins</span><span>Trade outcomes saved to this profile</span></div>
        </article>

        <article className="platform-panel platform-balance-panel">
          <div className="platform-section-heading">
            <div><span className="platform-kicker">ACCOUNT HEALTH</span><h2>Balance &amp; equity</h2></div>
            <span className="platform-health-dot"><i /> Journal balance</span>
          </div>
          <div className="platform-balance-stat">
            <div><span>Balance</span><small>Capital + recorded P&amp;L</small></div><strong>{currency(stats.balance)}</strong>
          </div>
          <ProgressTrack value={capital > 0 ? stats.balance / capital * 100 : 0} tone="blue" />
          <div className="platform-balance-meta"><span className={stats.balance >= capital ? "is-positive" : "is-negative"}>{currency(stats.balance - capital)} total P&amp;L</span><span>Start {currency(capital)}</span></div>
          <div className="platform-balance-divider" />
          <div className="platform-balance-stat">
            <div><span>Equity</span><small>Balance · no open trades tracked</small></div><strong>{currency(stats.balance)}</strong>
          </div>
          <ProgressTrack value={capital > 0 ? stats.balance / capital * 100 : 0} tone="green" />
          <div className="platform-balance-meta"><span>Realized P&amp;L only</span><span>{trades.length} saved trades</span></div>
        </article>
      </section>

      <section className="platform-panel platform-balance-chart-panel">
        <div className="platform-section-heading platform-chart-heading">
          <div><span className="platform-kicker">PERFORMANCE TIMELINE</span><h2>Account balance</h2><p>Balance and equity over time</p></div>
          <div className="platform-range-control">
            <button className="platform-button platform-button-quiet" type="button" aria-expanded={rangeOpen} onClick={() => setRangeOpen((open) => !open)}><PlatformIcon name="calendar" size={15} /> {dateRange}<PlatformIcon name="chevron-right" size={14} /></button>
            {rangeOpen && <div className="platform-range-menu">{(["Last 7 days", "Last 30 days", "This month"] as const).map((range) => <button key={range} type="button" onClick={() => { setDateRange(range); setRangeOpen(false); }}>{range}</button>)}</div>}
          </div>
        </div>
        <div className="platform-main-chart"><AccountBalanceChart range={dateRange} capital={capital} trades={trades} /></div>
        <div className="platform-chart-footer"><span>Updated just now</span><span><i className="legend-blue" /> Balance <i className="legend-green" /> Equity</span></div>
      </section>

      <section className="platform-performance-grid" aria-label="Performance statistics">
        <article className="platform-performance-card"><span>Average win</span><strong className="is-positive">{stats.wins.length ? currency(stats.averageWin) : "—"}</strong><small>{stats.wins.length} winning trades</small></article>
        <article className="platform-performance-card"><span>Win ratio</span><strong>{stats.winRate.toFixed(1)}%</strong><small>{stats.wins.length} wins · {stats.losses.length} losses</small></article>
        <article className="platform-performance-card"><span>Average loss</span><strong className="is-negative">{stats.losses.length ? currency(stats.averageLoss) : "—"}</strong><small>{stats.losses.length} losing trades</small></article>
        <article className="platform-performance-card"><span>Profit factor</span><strong>{stats.profitFactor === undefined ? "—" : stats.profitFactor.toFixed(2)}</strong><small>Gross profit / gross loss</small></article>
      </section>

      {profile.propfirm && dailyLimit !== undefined && maxLimit !== undefined && profitTarget !== undefined && (
      <section className="platform-section-block">
        <div className="platform-section-heading platform-objectives-heading">
          <div><span className="platform-kicker">RULES &amp; REQUIREMENTS</span><h2>Trading objectives</h2></div>
          <span className="platform-objectives-count"><PlatformIcon name="shield" size={14} /> Based on profile limits</span>
        </div>
        <div className="platform-objectives-grid">
          <DailyLossObjective dailyLimit={dailyLimit} dailyPnl={stats.dailyPnl} />
          <MaximumLossObjective maxLimit={maxLimit} maxDrawdown={stats.maxDrawdown} />
          <ProfitTargetObjective profit={stats.balance - capital} target={profitTarget} />
          <TradingDaysObjective tradingDays={stats.tradingDays} />
        </div>
      </section>
      )}

      <section className="platform-section-block">
        <div className="platform-section-heading">
          <div><span className="platform-kicker">YOUR TRADING ACTIVITY</span><h2>Deep analytics</h2></div>
          <span className="platform-chart-caption">Based on saved trades</span>
        </div>
        <div className="platform-analytics-grid">
          {advancedCards.map((card) => (
            <article className="platform-analytics-card" key={card.label}>
              <span>{card.label}</span><strong className={card.tone || ""}>{card.value}</strong><small>{card.detail}</small>
            </article>
          ))}
          <article className="platform-analytics-card platform-analysis-card">
            <div className="platform-analysis-heading"><div><span>TRADE DIRECTION</span><strong>Position analysis</strong></div><button className="platform-icon-button" type="button" aria-label="Analysis details" onClick={() => setDialog("faq")}><PlatformIcon name="help" size={14} /></button></div>
            <div className="platform-donut-row">
              <HalfDonut title="Long trades" amount={currency(stats.bySide.Long)} caption={`${trades.filter((trade) => trade.side === "Long").length} trades · net P&L`} progress={trades.length ? trades.filter((trade) => trade.side === "Long").length / trades.length * 100 : 0} tone={stats.bySide.Long >= 0 ? "green" : "red"} />
              <HalfDonut title="Profitability" amount={`${stats.winRate.toFixed(1)}%`} caption={`${stats.wins.length} of ${trades.length} wins`} progress={stats.winRate} tone="blue" />
              <HalfDonut title="Short trades" amount={currency(stats.bySide.Short)} caption={`${trades.filter((trade) => trade.side === "Short").length} trades · net P&L`} progress={trades.length ? trades.filter((trade) => trade.side === "Short").length / trades.length * 100 : 0} tone={stats.bySide.Short >= 0 ? "green" : "red"} />
            </div>
          </article>
        </div>
      </section>

      <section className="platform-section-block">
        <div className="platform-section-heading">
          <div><span className="platform-kicker">TRADE QUALITY</span><h2>Advanced charts</h2></div>
          <span className="platform-chart-caption">Based on {trades.length} saved trades</span>
        </div>
        <div className="platform-advanced-grid">
          <article className="platform-panel platform-advanced-chart-card"><div className="platform-chart-card-heading"><div><h3>Trade outcomes</h3><p>Wins, losses, and breakeven trades</p></div></div><div className="platform-secondary-chart"><TradeOutcomesChart trades={trades} /></div></article>
          <article className="platform-panel platform-advanced-chart-card"><div className="platform-chart-card-heading"><div><h3>Instrument profit analysis</h3><p>Recorded P&amp;L grouped by symbol</p></div></div><div className="platform-secondary-chart"><InstrumentProfitChart trades={trades} /></div></article>
          <article className="platform-panel platform-advanced-chart-card"><div className="platform-chart-card-heading"><div><h3>Instrument volume analysis</h3><p>Total recorded position size</p></div><span className="platform-chart-caption">Lots / units</span></div><div className="platform-secondary-chart"><InstrumentVolumeChart trades={trades} /></div></article>
        </div>
      </section>

      {trades.length > 0 && (
        <TradingHistory
          trades={trades}
          onShare={shareDashboard}
          onDeleteTrade={onDeleteTrade}
          onClearTrades={onClearTrades}
        />
      )}

      <footer className="platform-footer"><span>{profile.name}</span><span><i /> Performance reflects trades saved to this profile</span></footer>
      <Journal trades={trades} addTrade={onAddTrade} />
      {dialog && <Dialog kind={dialog} onClose={() => setDialog(null)} />}
      {monthToast && <div className="platform-toast" role="status">{monthToast}</div>}
    </main>
  );
}
