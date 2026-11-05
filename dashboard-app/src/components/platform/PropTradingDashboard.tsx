import { useState } from "react";
import type { Profile } from "../../types";
import {
  AccountBalanceChart,
  DurationBoxPlot,
  DurationScatterChart,
  InstrumentProfitChart,
  InstrumentVolumeChart,
  ScoreRadar,
} from "./PlatformCharts";
import { TradingCalendar } from "./TradingCalendar";
import { TradingHistory } from "./TradingHistory";
import { PlatformIcon } from "./platformIcons";
import "../../platform-dashboard.css";

type DialogKind = "credentials" | "share" | "faq" | null;
type RangePreset = "Last 7 days" | "Last 30 days" | "This month";

interface PropTradingDashboardProps {
  profile: Profile;
  onEditProfile: () => void;
  onSwitchProfile: () => void;
  onNewProfile: () => void;
  onDeleteProfile: () => void;
}

const summaryCards = [
  { label: "Account size", value: "$5,000.00", detail: "Challenge balance", icon: "shield" as const, tone: "blue" },
  { label: "Today's profit", value: "$0.00", detail: "Since daily reset", icon: "chart" as const, tone: "green" },
  { label: "Start date", value: "Oct 20, 2026", detail: "Challenge started", icon: "calendar" as const, tone: "violet" },
  { label: "End date", value: "--", detail: "No time limit", icon: "clock" as const, tone: "neutral" },
];

const advancedCards = [
  { label: "Number of days", value: "13", detail: "Trading days" },
  { label: "Total trades taken", value: "76", detail: "Closed positions" },
  { label: "Total lots used", value: "26.12", detail: "Across 6 instruments" },
  { label: "Biggest win", value: "$77.00", detail: "Best single trade", tone: "is-positive" },
  { label: "Biggest loss", value: "-$57.20", detail: "Largest drawdown trade", tone: "is-negative" },
];

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
  const title = kind === "credentials" ? "Trading credentials" : kind === "faq" ? "Account FAQ" : "Share account";
  return (
    <div className="platform-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="platform-dialog" role="dialog" aria-modal="true" aria-labelledby="platform-dialog-title">
        <button className="platform-dialog-close" type="button" aria-label="Close dialog" onClick={onClose}>×</button>
        <span className="platform-dialog-icon"><PlatformIcon name={kind === "credentials" ? "lock" : kind === "faq" ? "help" : "share"} size={19} /></span>
        <h2 id="platform-dialog-title">{title}</h2>
        {kind === "credentials" && (
          <>
            <p>These are demo account details for this dashboard preview.</p>
            <div className="platform-credential-row"><span>Account number</span><strong>#21084999</strong></div>
            <div className="platform-credential-row"><span>Trading platform</span><strong>MetaTrader 5</strong></div>
            <div className="platform-credential-row"><span>Server</span><strong>AtlasMarkets-Demo</strong></div>
            <div className="platform-sensitive-note">Password and investor credentials are not displayed in this demo.</div>
          </>
        )}
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
            <h3>Is this live account data?</h3><p>No. This interface is populated with mock data for the dashboard preview.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function DailyLossObjective() {
  return (
    <article className="platform-objective-card">
      <div className="platform-objective-heading">
        <span className="platform-objective-icon objective-blue"><PlatformIcon name="shield" /></span>
        <div><h3>Maximum daily loss</h3><p>Daily drawdown limit</p></div>
        <span className="platform-objective-status status-safe">On track</span>
      </div>
      <div className="platform-objective-primary">
        <span>Remaining today</span>
        <strong>$271.17</strong>
        <small>Resets in <b>12:32:59</b></small>
      </div>
      <ProgressTrack value={20.3} tone="blue" />
      <div className="platform-objective-details">
        <span>Max daily loss recorded<strong>$48.78</strong></span>
        <span>Current daily loss<strong>$0.00</strong></span>
        <span>Max allowed<strong>$239.96</strong></span>
        <span>Today's starting equity<strong>$4,830.50</strong></span>
      </div>
    </article>
  );
}

function MaximumLossObjective() {
  return (
    <article className="platform-objective-card">
      <div className="platform-objective-heading">
        <span className="platform-objective-icon objective-violet"><PlatformIcon name="chart" /></span>
        <div><h3>Maximum loss</h3><p>Overall account drawdown</p></div>
        <span className="platform-objective-status status-safe">On track</span>
      </div>
      <div className="platform-objective-primary">
        <span>Remaining</span>
        <strong>$330.50</strong>
        <small>of $500.00 max allowed loss</small>
      </div>
      <ProgressTrack value={33.9} tone="green" />
      <div className="platform-objective-details">
        <span>Max allowed loss<strong>$500.00</strong></span>
        <span>Balance threshold<strong>$4,500.00</strong></span>
      </div>
    </article>
  );
}

function ProfitTargetObjective() {
  return (
    <article className="platform-objective-card">
      <div className="platform-objective-heading">
        <span className="platform-objective-icon objective-green"><PlatformIcon name="arrow-up-right" /></span>
        <div><h3>Profit target</h3><p>Reach your challenge goal</p></div>
        <span className="platform-objective-percent">0%</span>
      </div>
      <div className="platform-objective-primary">
        <span>Profit achieved</span>
        <strong>$0.00 <small>of $400.00</small></strong>
      </div>
      <ProgressTrack value={0} tone="green" />
      <div className="platform-objective-footnote">Complete the target to pass this phase.</div>
    </article>
  );
}

function MinimumDaysObjective() {
  return (
    <article className="platform-objective-card platform-passed-card">
      <div className="platform-objective-heading">
        <span className="platform-objective-icon objective-green"><PlatformIcon name="check" /></span>
        <div><h3>Minimum trading days</h3><p>Required trading activity</p></div>
        <span className="platform-objective-status status-passed"><PlatformIcon name="check" size={12} /> Passed</span>
      </div>
      <div className="platform-passed-copy"><strong>Requirement met</strong><span>Minimum trading days completed successfully.</span></div>
    </article>
  );
}

export function PropTradingDashboard({
  profile,
  onEditProfile,
  onSwitchProfile,
  onNewProfile,
  onDeleteProfile,
}: PropTradingDashboardProps) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [dateRange, setDateRange] = useState<RangePreset>("Last 30 days");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [monthToast, setMonthToast] = useState("");

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

  const firmName = profile.mode === "propfirm"
    ? profile.propfirm?.firmName || "Atlas Funded"
    : profile.broker?.brokerName || "Atlas Markets";
  const phase = profile.mode === "propfirm" ? profile.propfirm?.phase || "Phase 1" : "Live Account";

  return (
    <main className="platform-dashboard">
      <div className="platform-page-topline">
        <nav className="platform-breadcrumbs" aria-label="Breadcrumb">
          <button type="button" onClick={onSwitchProfile}>Home</button><span>/</span><span>Accounts</span><span>/</span><strong>#21084999</strong>
        </nav>
        <span className="platform-live-indicator"><i /> Account overview</span>
      </div>

      <header className="platform-account-header">
        <div className="platform-account-identity">
          <div className="platform-firm-logo" aria-label={`${firmName} placeholder logo`}>A<span>F</span></div>
          <div>
            <div className="platform-account-title-row"><h1>{firmName}</h1><span className="platform-account-id">#21084999</span></div>
            <p>Trading account <span className="platform-dot-separator">·</span> Created Oct 20, 2026</p>
          </div>
        </div>
        <div className="platform-account-actions">
          <button className="platform-button platform-button-quiet" type="button" onClick={() => setDialog("credentials")}><PlatformIcon name="lock" size={15} /> Credentials</button>
          <button className="platform-button platform-button-quiet" type="button" onClick={shareDashboard}><PlatformIcon name="share" size={15} /> Share</button>
          <button className="platform-button platform-button-quiet" type="button" onClick={() => setDialog("faq")}><PlatformIcon name="help" size={15} /> FAQ</button>
          <div className="platform-profile-actions">
            <button type="button" onClick={onEditProfile}>Edit</button><button type="button" onClick={onSwitchProfile}>Switch</button><button type="button" onClick={onNewProfile}>New</button><button className="platform-danger-text" type="button" onClick={onDeleteProfile}>Delete</button>
          </div>
        </div>
      </header>

      <div className="platform-status-row">
        <span className="platform-status-pill pill-ongoing"><i /> Ongoing</span>
        <span className="platform-status-pill">Two Step</span>
        <span className="platform-status-pill"> {phase}</span>
        <span className="platform-status-pill platform-platform-pill"><span className="platform-mt-mark">M</span> Meta Trader 5</span>
      </div>

      <section className="platform-summary-grid" aria-label="Account summary">
        {summaryCards.map((card) => (
          <article className="platform-summary-card" key={card.label}>
            <span className={`platform-summary-icon tone-${card.tone}`}><PlatformIcon name={card.icon} size={17} /></span>
            <div><p>{card.label}</p><strong>{card.value}</strong><small>{card.detail}</small></div>
          </article>
        ))}
      </section>

      <section className="platform-overview-grid">
        <article className="platform-panel platform-score-panel">
          <div className="platform-section-heading">
            <div><span className="platform-kicker">TRADER PERFORMANCE</span><h2>Score overview</h2></div>
            <button className="platform-icon-button" type="button" aria-label="Score details" onClick={() => setDialog("faq")}><PlatformIcon name="help" size={15} /></button>
          </div>
          <div className="platform-score-content">
            <div className="platform-score-value"><span>OVERALL SCORE</span><strong>38.77</strong><small><PlatformIcon name="arrow-down-right" size={13} /> Needs improvement</small></div>
            <div className="platform-radar-wrap"><ScoreRadar /></div>
          </div>
          <div className="platform-score-legend"><span><i className="legend-blue" /> Your score</span><span>Measured across 4 trading behaviors</span></div>
        </article>

        <article className="platform-panel platform-balance-panel">
          <div className="platform-section-heading">
            <div><span className="platform-kicker">ACCOUNT HEALTH</span><h2>Balance &amp; equity</h2></div>
            <span className="platform-health-dot"><i /> Healthy</span>
          </div>
          <div className="platform-balance-stat">
            <div><span>Balance</span><small>Account funds</small></div><strong>$4,830.50</strong>
          </div>
          <ProgressTrack value={96.6} tone="blue" />
          <div className="platform-balance-meta"><span>0.00% change</span><span>Max $5,025.51</span></div>
          <div className="platform-balance-divider" />
          <div className="platform-balance-stat">
            <div><span>Equity</span><small>Balance + open P&amp;L</small></div><strong>$4,830.50</strong>
          </div>
          <ProgressTrack value={96.1} tone="green" />
          <div className="platform-balance-meta"><span className="is-positive">+$0.00 floating</span><span>Max $5,027.70</span></div>
          <div className="platform-account-mini-metrics"><span>Free margin<strong>$4,830.50</strong></span><span>Margin level<strong>—</strong></span><span>Leverage<strong>1:100</strong></span></div>
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
        <div className="platform-main-chart"><AccountBalanceChart range={dateRange} /></div>
        <div className="platform-chart-footer"><span>Updated just now</span><span><i className="legend-blue" /> Balance <i className="legend-green" /> Equity</span></div>
      </section>

      <section className="platform-performance-grid" aria-label="Performance statistics">
        <article className="platform-performance-card"><span>Average win</span><strong className="is-positive">$24.17</strong><small><PlatformIcon name="arrow-up-right" size={13} /> Per winning trade</small></article>
        <article className="platform-performance-card"><span>Win ratio</span><strong>47.0%</strong><small>36 wins · 40 losses</small></article>
        <article className="platform-performance-card"><span>Average loss</span><strong className="is-negative">-$27.45</strong><small><PlatformIcon name="arrow-down-right" size={13} /> Per losing trade</small></article>
        <article className="platform-performance-card"><span>Profit factor</span><strong>0.79</strong><small>Gross profit / gross loss</small></article>
      </section>

      <section className="platform-section-block">
        <div className="platform-section-heading platform-objectives-heading">
          <div><span className="platform-kicker">RULES &amp; REQUIREMENTS</span><h2>Trading objectives</h2></div>
          <span className="platform-objectives-count"><PlatformIcon name="shield" size={14} /> 3 of 4 on track</span>
        </div>
        <div className="platform-objectives-grid">
          <DailyLossObjective />
          <MaximumLossObjective />
          <ProfitTargetObjective />
          <MinimumDaysObjective />
        </div>
      </section>

      <TradingCalendar />

      <section className="platform-section-block">
        <div className="platform-section-heading">
          <div><span className="platform-kicker">YOUR TRADING ACTIVITY</span><h2>Deep analytics</h2></div>
          <button className="platform-button platform-button-quiet" type="button" onClick={() => showToast("Analytics are up to date.")}>Updated today <PlatformIcon name="chevron-right" size={14} /></button>
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
              <HalfDonut title="Short analysis" amount="+$210.20" caption="Net profit" progress={72} tone="green" />
              <HalfDonut title="Profitability" amount="47.0%" caption="36 of 76 wins" progress={47} tone="blue" />
              <HalfDonut title="Long analysis" amount="-$438.41" caption="Net profit" progress={39} tone="red" />
            </div>
          </article>
        </div>
      </section>

      <section className="platform-section-block">
        <div className="platform-section-heading">
          <div><span className="platform-kicker">TRADE QUALITY</span><h2>Advanced charts</h2></div>
          <span className="platform-chart-caption">Based on 76 closed trades</span>
        </div>
        <div className="platform-advanced-grid">
          <article className="platform-panel platform-advanced-chart-card"><div className="platform-chart-card-heading"><div><h3>PnL distribution by duration</h3><p>Trade outcome range by holding time</p></div><button className="platform-icon-button" type="button" aria-label="Distribution chart details" onClick={() => showToast("Box range shows minimum, quartiles, median and maximum.")}><PlatformIcon name="help" size={14} /></button></div><DurationBoxPlot /></article>
          <article className="platform-panel platform-advanced-chart-card"><div className="platform-chart-card-heading"><div><h3>PnL by trade duration</h3><p>Each dot represents one closed position</p></div><span className="platform-chart-caption">76 trades</span></div><div className="platform-secondary-chart"><DurationScatterChart /></div></article>
          <article className="platform-panel platform-advanced-chart-card"><div className="platform-chart-card-heading"><div><h3>Instrument profit analysis</h3><p>Winners and losses by symbol</p></div><button className="platform-icon-button" type="button" aria-label="Instrument profit details" onClick={() => showToast("Profit and loss is grouped by instrument.")}><PlatformIcon name="help" size={14} /></button></div><div className="platform-secondary-chart"><InstrumentProfitChart /></div></article>
          <article className="platform-panel platform-advanced-chart-card"><div className="platform-chart-card-heading"><div><h3>Instrument volume analysis</h3><p>Total lots traded by symbol</p></div><span className="platform-chart-caption">Lots</span></div><div className="platform-secondary-chart"><InstrumentVolumeChart /></div></article>
        </div>
      </section>

      <TradingHistory onShare={shareDashboard} />

      <footer className="platform-footer"><span>Demo account dashboard</span><span><i /> All figures shown are illustrative mock data</span></footer>
      {dialog && <Dialog kind={dialog} onClose={() => setDialog(null)} />}
      {monthToast && <div className="platform-toast" role="status">{monthToast}</div>}
    </main>
  );
}
