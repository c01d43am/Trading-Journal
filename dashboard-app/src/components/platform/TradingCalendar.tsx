import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "./platformIcons";
import { novemberDailySummary, weeklySummary } from "../../data/platformDashboard";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatPnl(value: number) {
  const amount = Math.abs(value).toFixed(2);
  return value < 0 ? `-$${amount}` : `$${amount}`;
}

export function TradingCalendar() {
  const [month, setMonth] = useState(() => new Date(2026, 10, 1));
  const days = useMemo(() => {
    const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const numberOfDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((firstWeekday + numberOfDays) / 7) * 7 }, (_, index) => {
      const dayNumber = index - firstWeekday + 1;
      return dayNumber > 0 && dayNumber <= numberOfDays ? dayNumber : null;
    });
  }, [month]);

  function changeMonth(amount: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  return (
    <section className="platform-panel platform-calendar-panel">
      <div className="platform-section-heading">
        <div>
          <span className="platform-kicker">DAILY BREAKDOWN</span>
          <h2>Trading calendar</h2>
        </div>
        <div className="platform-calendar-nav">
          <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button>
          <strong>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
          <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="platform-calendar-layout">
        <div className="platform-calendar-grid" role="grid" aria-label="Trading calendar">
          {weekdays.map((weekday) => <div className="platform-calendar-weekday" key={weekday}>{weekday}</div>)}
          {days.map((day, index) => {
            const summary = month.getMonth() === 10 && day ? novemberDailySummary[day] : undefined;
            return (
              <div
                className={`platform-calendar-day${day ? "" : " is-outside"}${summary ? " has-trades" : ""}`}
                key={`${month.getFullYear()}-${month.getMonth()}-${index}`}
                role="gridcell"
              >
                {day && (
                  <>
                    <span className="platform-calendar-date">{day}</span>
                    {summary && (
                      <div className="platform-calendar-summary">
                        <span>{summary.trades} trades</span>
                        <strong className={summary.pnl >= 0 ? "is-positive" : "is-negative"}>{formatPnl(summary.pnl)}</strong>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <aside className="platform-weekly-summary">
          <div className="platform-weekly-heading">
            <h3>Weekly summary</h3>
            <span>November</span>
          </div>
          {weeklySummary.map((week) => (
            <div className="platform-week-row" key={week.week}>
              <span>{week.week}<small>{week.days} days traded</small></span>
              <strong className={week.pnl >= 0 ? "is-positive" : "is-negative"}>{formatPnl(week.pnl)}</strong>
            </div>
          ))}
          <div className="platform-week-total"><span>Monthly net</span><strong className="is-positive">$216.92</strong></div>
        </aside>
      </div>
    </section>
  );
}
