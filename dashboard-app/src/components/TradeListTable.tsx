import type { Trade } from "../types";

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function TradeListTable({
  trades,
  currency = "USD",
  title = "Trade History",
  emptyMessage = "No trades recorded for this period.",
}: {
  trades: Trade[];
  currency?: string;
  title?: string;
  emptyMessage?: string;
}) {
  return (
    <section className="mt-6 min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/30" aria-labelledby="calendar-trade-list-title">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-100" id="calendar-trade-list-title">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{trades.length} {trades.length === 1 ? "trade" : "trades"}</p>
        </div>
      </div>
      {trades.length === 0 ? (
        <p className="p-5 text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <>
          <div className="space-y-2 p-3 sm:hidden">
            {trades.map((trade) => (
              <article key={trade.id} className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-xs">
                <span className="truncate font-semibold text-slate-100">{trade.symbol}</span>
                <span className="text-right text-slate-400">{trade.side}</span>
                <span className="text-slate-500">{trade.date} {trade.time ?? ""}</span>
                <strong className={`break-words text-right ${trade.pnl > 0 ? "text-emerald-300" : trade.pnl < 0 ? "text-rose-300" : "text-slate-300"}`}>{formatCurrency(trade.pnl, currency)}</strong>
                <span className="col-span-2 break-words text-slate-500">
                  Entry {trade.entryPrice ?? "—"} → Exit {trade.exitPrice ?? "—"}
                  {" · "}
                  {trade.rMultiple == null ? "—" : `${trade.rMultiple.toFixed(2)}R`}
                </span>
              </article>
            ))}
          </div>
          <div className="hidden max-w-full overflow-x-auto sm:block">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <tr>{["Date / Time", "Pair", "Direction", "Entry", "Exit", "P&L", "R-Multiple"].map((heading) => <th className="whitespace-nowrap px-4 py-3 font-medium" key={heading}>{heading}</th>)}</tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr className="border-t border-slate-800/80 text-slate-300" key={trade.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{trade.date} {trade.time ?? ""}</td>
                    <td className="px-4 py-3 font-semibold text-slate-200">{trade.symbol}</td>
                    <td className="px-4 py-3">{trade.side}</td>
                    <td className="px-4 py-3">{trade.entryPrice ?? "—"}</td>
                    <td className="px-4 py-3">{trade.exitPrice ?? "—"}</td>
                    <td className={`whitespace-nowrap px-4 py-3 font-semibold ${trade.pnl > 0 ? "text-emerald-300" : trade.pnl < 0 ? "text-rose-300" : "text-slate-300"}`}>{formatCurrency(trade.pnl, currency)}</td>
                    <td className="px-4 py-3">{trade.rMultiple == null ? "—" : `${trade.rMultiple.toFixed(2)}R`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
