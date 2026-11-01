import { useEffect, useState } from "react";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  parseISO,
  startOfMonth,
} from "date-fns";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = Array.from({ length: 12 }, (_, month) =>
  format(new Date(2020, month, 1), "MMMM"),
);

function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function TradeDatePicker({
  value,
  onChange,
  dateRange,
}: {
  value: string;
  onChange: (date: string) => void;
  dateRange?: { dateFrom: string; dateTo: string };
}) {
  const selectedDate = parseISO(value);
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDate));
  const [yearInput, setYearInput] = useState(() => format(selectedDate, "yyyy"));
  const monthDays = eachDayOfInterval({
    start: startOfMonth(visibleMonth),
    end: endOfMonth(visibleMonth),
  });
  const leadingDays = getDay(startOfMonth(visibleMonth));
  const todayKey = dateKey(new Date());

  useEffect(() => {
    const selected = parseISO(value);
    setVisibleMonth(startOfMonth(selected));
    setYearInput(format(selected, "yyyy"));
  }, [value]);

  function chooseDate(date: Date) {
    onChange(dateKey(date));
    setIsOpen(false);
  }

  function updateYear(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    setYearInput(digits);
    if (digits.length !== 4) return;
    const year = Number(digits);
    if (year >= 1900 && year <= 9999) {
      setVisibleMonth((month) => new Date(year, month.getMonth(), 1));
    }
  }

  return (
    <div className="relative min-w-0">
      <input type="hidden" name="date" value={value} />
      <button
        className="flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-left text-sm text-slate-100 hover:border-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
        type="button"
        aria-label={`Trade date, ${format(selectedDate, "MMMM d, yyyy")}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{format(selectedDate, "MMM d, yyyy")}</span>
        <span aria-hidden="true" className="text-slate-400">▦</span>
      </button>
      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-slate-950/60 sm:hidden"
            aria-label="Close date picker"
            onClick={() => setIsOpen(false)}
          />
          <section
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-slate-700 bg-slate-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:absolute sm:left-0 sm:top-[calc(100%+0.5rem)] sm:bottom-auto sm:w-[min(22rem,calc(100vw-2rem))] sm:rounded-2xl sm:p-4"
            role="dialog"
            aria-label="Choose trade date"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">Choose date</h3>
              <button
                type="button"
                className="grid size-11 shrink-0 place-items-center rounded-lg border border-slate-700 text-lg text-slate-300 hover:bg-slate-800"
                aria-label="Close date picker"
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="mb-3 flex items-center gap-2">
              <label className="sr-only" htmlFor="trade-date-picker-month">Month</label>
              <select
                id="trade-date-picker-month"
                className="h-11 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
                value={visibleMonth.getMonth()}
                onChange={(event) => setVisibleMonth((month) =>
                  new Date(month.getFullYear(), Number(event.target.value), 1),
                )}
              >
                {MONTHS.map((month, index) => <option value={index} key={month}>{month}</option>)}
              </select>
              <label className="sr-only" htmlFor="trade-date-picker-year">Year</label>
              <input
                id="trade-date-picker-year"
                className="h-11 w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
                inputMode="numeric"
                aria-label="Year"
                value={yearInput}
                onChange={(event) => updateYear(event.target.value)}
              />
            </div>
            <div className="mb-2 grid grid-cols-7 text-center text-[10px] font-medium uppercase text-slate-500">
              {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: leadingDays }, (_, index) => (
                <span key={`blank-${index}`} aria-hidden="true" />
              ))}
              {monthDays.map((date) => {
                const key = dateKey(date);
                const disabled = Boolean(dateRange && (key < dateRange.dateFrom || key > dateRange.dateTo));
                const selected = key === value;
                return (
                  <button
                    key={key}
                    className={`min-h-11 min-w-0 rounded-lg text-sm transition ${
                      disabled
                        ? "cursor-not-allowed text-slate-700"
                        : selected
                        ? "bg-violet-400 text-slate-950"
                        : key === todayKey
                        ? "border border-sky-400/60 text-sky-200 hover:bg-slate-800"
                        : "text-slate-200 hover:bg-slate-800"
                    }`}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => chooseDate(date)}
                  >
                    {format(date, "d")}
                  </button>
                );
              })}
            </div>
            {dateRange && (
              <p className="mt-3 text-xs leading-5 text-violet-200">
                Backtest range: {dateRange.dateFrom} to {dateRange.dateTo}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
