import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
} from "date-fns";
import { TradeListTable } from "./TradeListTable";
import type { Trade } from "../types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = Array.from({ length: 12 }, (_, month) =>
  format(new Date(2020, month, 1), "MMMM"),
);

function localDateKey(date: Date | string) {
  const parsed = typeof date === "string" ? parseISO(date) : date;
  return format(parsed, "yyyy-MM-dd");
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function signedCurrency(value: number, currency: string) {
  return value > 0 ? `+${formatCurrency(value, currency)}` : formatCurrency(value, currency);
}

export function TradeCalendar({
  trades,
  currency = "USD",
  dateRange,
}: {
  trades: Trade[];
  currency?: string;
  dateRange?: { dateFrom: string; dateTo: string };
}) {
  const [initialMonth] = useState(() => dateRange ? parseISO(dateRange.dateFrom) : new Date());
  const [selectedMonth, setSelectedMonth] = useState(() => initialMonth.getMonth());
  const [selectedYear, setSelectedYear] = useState(() => initialMonth.getFullYear());
  const [yearInput, setYearInput] = useState(() => String(initialMonth.getFullYear()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const visibleMonth = new Date(selectedYear, selectedMonth, 1);
  const visibleTrades = useMemo(() => dateRange
    ? trades.filter((trade) => {
      const date = localDateKey(trade.date);
      return date >= dateRange.dateFrom && date <= dateRange.dateTo;
    })
    : trades, [dateRange, trades]);
  const dailyTrades = useMemo(() => {
    const grouped = new Map<string, Trade[]>();
    for (const trade of visibleTrades) {
      const key = localDateKey(trade.date);
      const group = grouped.get(key) ?? [];
      group.push(trade);
      grouped.set(key, group);
    }
    return grouped;
  }, [visibleTrades]);

  const pairCounts = useMemo(() => {
    const counts = new Map<string, { count: number; label: string }>();
    for (const trade of visibleTrades) {
      const label = trade.symbol.trim() || "—";
      const key = label.toLocaleLowerCase();
      const pair = counts.get(key);
      if (pair) pair.count += 1;
      else counts.set(key, { count: 1, label });
    }
    return [...counts.values()].sort((left, right) =>
      right.count - left.count || left.label.localeCompare(right.label),
    )[0]?.label ?? "—";
  }, [visibleTrades]);

  const wins = visibleTrades.filter((trade) => trade.pnl > 0).length;
  const winRate = visibleTrades.length ? wins / visibleTrades.length * 100 : 0;
  const totalPnl = visibleTrades.reduce((total, trade) => total + trade.pnl, 0);
  const monthLabel = format(visibleMonth, "MMMM yyyy");
  const leadingDays = getDay(startOfMonth(visibleMonth));
  const monthDays = eachDayOfInterval({
    start: startOfMonth(visibleMonth),
    end: endOfMonth(visibleMonth),
  });
  const cellCount = Math.ceil((leadingDays + monthDays.length) / 7) * 7;
  const today = new Date();
  const monthTrades = visibleTrades
    .filter((trade) => {
      const date = parseISO(trade.date);
      return Number.isFinite(date.getTime()) && isSameMonth(date, visibleMonth);
    })
    .slice()
    .sort((left, right) =>
      `${left.date}T${left.time ?? ""}`.localeCompare(`${right.date}T${right.time ?? ""}`),
    );
  const selectedTrades = selectedDay
    ? (dailyTrades.get(selectedDay) ?? [])
    : monthTrades;

  useEffect(() => {
    setYearInput(String(selectedYear));
  }, [selectedYear]);

  useEffect(() => {
    if (!dateRange) return;
    const from = parseISO(dateRange.dateFrom);
    setSelectedMonth(from.getMonth());
    setSelectedYear(from.getFullYear());
    setYearInput(String(from.getFullYear()));
    setSelectedDay(null);
  }, [dateRange?.dateFrom, dateRange?.dateTo]);

  function changeMonth(offset: number) {
    const month = addMonths(visibleMonth, offset);
    setSelectedMonth(month.getMonth());
    setSelectedYear(month.getFullYear());
    setSelectedDay(null);
  }

  function selectMonth(month: number) {
    setSelectedMonth(month);
    setSelectedDay(null);
  }

  function selectYear(year: number) {
    setSelectedYear(year);
    setYearInput(String(year));
    setSelectedDay(null);
  }

  function goToToday() {
    const now = new Date();
    setSelectedMonth(now.getMonth());
    setSelectedYear(now.getFullYear());
    setYearInput(String(now.getFullYear()));
    setSelectedDay(null);
  }

  return (
    <section className="panel mt-5 min-w-0" aria-labelledby="trade-calendar-title">
      <div className="mb-5">
        <h2 className="section-title" id="trade-calendar-title">Trade history</h2>
        <p className="section-subtitle">Monthly performance at a glance. Select a day to review its trades.</p>
        {dateRange && (
          <p className="mt-2 inline-flex max-w-full flex-wrap rounded-lg border border-violet-400/20 bg-violet-400/5 px-3 py-2 text-xs text-violet-200">
            Backtest Range: {dateRange.dateFrom} to {dateRange.dateTo}
          </p>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Total Trades" value={String(trades.length)} />
        <SummaryCard
          label="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          valueClass={winRate > 50 ? "text-emerald-300" : winRate < 50 ? "text-rose-300" : "text-slate-100"}
        />
        <SummaryCard
          label="Total P&L"
          value={signedCurrency(totalPnl, currency)}
          valueClass={totalPnl > 0 ? "text-emerald-300" : totalPnl < 0 ? "text-rose-300" : "text-slate-100"}
        />
        <SummaryCard label="Top Pair" value={pairCounts} />
      </div>

      <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-100" aria-live="polite">{monthLabel}</h3>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="trade-calendar-month">Month</label>
          <select
            id="trade-calendar-month"
            className="h-11 min-w-0 max-w-36 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100"
            value={selectedMonth}
            onChange={(event) => selectMonth(Number(event.target.value))}
          >
            {MONTHS.map((month, index) => <option value={index} key={month}>{month}</option>)}
          </select>
          <label className="sr-only" htmlFor="trade-calendar-year">Year</label>
          <input
            id="trade-calendar-year"
            className="h-11 w-24 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100"
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={yearInput}
            onChange={(event) => {
              const value = event.target.value.replace(/\D/g, "").slice(0, 4);
              setYearInput(value);
              if (value.length === 4) {
                const year = Number(value);
                if (year >= 1900 && year <= 9999) selectYear(year);
              }
            }}
          />
          <button className="button-quiet min-h-11 min-w-11 px-3" type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}>‹</button>
          <button className="button-quiet min-h-11 px-4" type="button" onClick={goToToday}>Today</button>
          <button className="button-quiet min-h-11 min-w-11 px-3" type="button" aria-label="Next month" onClick={() => changeMonth(1)}>›</button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-800 pb-2 text-center text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5 pt-1.5 sm:gap-2">
        {Array.from({ length: cellCount }, (_, index) => {
          const dayIndex = index - leadingDays;
          if (dayIndex < 0 || dayIndex >= monthDays.length) {
            return <div key={`empty-${index}`} className="min-h-[76px] rounded-lg bg-slate-950/20 sm:min-h-28" aria-hidden="true" />;
          }

          const date = monthDays[dayIndex];
          const dateKey = localDateKey(date);
          const dayTrades = dailyTrades.get(dateKey) ?? [];
          const dailyPnl = dayTrades.reduce((total, trade) => total + trade.pnl, 0);
          const isInRange = !dateRange || (dateKey >= dateRange.dateFrom && dateKey <= dateRange.dateTo);
          const isToday = isSameDay(date, today);
          const isSelected = selectedDay === dateKey;
          return (
            <button
              key={dateKey}
              className={`flex min-h-[76px] min-w-0 flex-col items-start rounded-lg border p-1.5 text-left transition sm:min-h-28 sm:p-3 ${
                !isInRange
                  ? "cursor-not-allowed border-slate-900 bg-slate-950/10 opacity-35"
                  : isSelected
                  ? "border-violet-400/80 bg-violet-400/10"
                  : isToday
                  ? "border-sky-400/70 bg-sky-400/10"
                  : dateRange
                  ? "border-violet-400/20 bg-violet-400/[0.03] hover:border-violet-300/50 hover:bg-slate-900/70"
                  : "border-slate-800 bg-slate-950/30 hover:border-slate-600 hover:bg-slate-900/70"
              }`}
              type="button"
              disabled={!isInRange}
              aria-label={`${date.toLocaleDateString()}, ${isInRange ? `${dayTrades.length} trades, ${signedCurrency(dailyPnl, currency)}` : "outside backtest range"}`}
              aria-pressed={isSelected}
              onClick={() => setSelectedDay((current) => current === dateKey ? null : dateKey)}
            >
              <span className={`text-xs font-semibold sm:text-sm ${isSelected ? "text-violet-200" : isToday ? "text-sky-200" : "text-slate-300"}`}>{format(date, "d")}</span>
              {dayTrades.length > 0 && (
                <span className="mt-1 flex min-w-0 flex-col gap-0.5">
                  <span className="text-[10px] leading-tight text-slate-400 sm:text-xs">
                    {dayTrades.length}<span className="hidden sm:inline"> {dayTrades.length === 1 ? "trade" : "trades"}</span>
                  </span>
                  <span className={`break-all text-[10px] font-semibold leading-tight sm:text-xs ${dailyPnl > 0 ? "text-emerald-300" : dailyPnl < 0 ? "text-rose-300" : "text-slate-300"}`}>
                    {signedCurrency(dailyPnl, currency)}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <TradeListTable
        trades={selectedTrades}
        currency={currency}
        title={selectedDay ? `Trade History · ${format(parseISO(selectedDay), "MMM d, yyyy")}` : `Trade History · ${monthLabel}`}
        emptyMessage={selectedDay
          ? "No trades recorded for this day."
          : dateRange && (format(visibleMonth, "yyyy-MM") < dateRange.dateFrom.slice(0, 7) || format(visibleMonth, "yyyy-MM") > dateRange.dateTo.slice(0, 7))
          ? "This month is outside the backtest range."
          : "No trades recorded for this month."}
      />
    </section>
  );
}

function SummaryCard({
  label,
  value,
  valueClass = "text-slate-100",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <article className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/40 p-3 sm:p-4">
      <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <strong className={`mt-2 block break-words text-base font-semibold sm:text-lg ${valueClass}`}>{value}</strong>
    </article>
  );
}
