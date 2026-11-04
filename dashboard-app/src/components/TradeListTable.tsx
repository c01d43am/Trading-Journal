import { useEffect, useRef, useState } from "react";
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
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selectedTrade && !dialog.open) dialog.showModal();
    else if (!selectedTrade && dialog.open) dialog.close();
  }, [selectedTrade]);

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
                <button className="col-span-2 min-h-10 rounded-lg border border-slate-700 px-3 text-left font-semibold text-sky-300" type="button" onClick={() => setSelectedTrade(trade)}>
                  View trade details{trade.imageData ? " · Screenshot attached" : ""}
                </button>
              </article>
            ))}
          </div>
          <div className="hidden max-w-full overflow-x-auto sm:block">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <tr>{["Date / Time", "Pair", "Direction", "Entry", "Exit", "P&L", "R-Multiple", "Details"].map((heading) => <th className="whitespace-nowrap px-4 py-3 font-medium" key={heading}>{heading}</th>)}</tr>
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
                    <td className="px-4 py-3">
                      <button className="font-semibold text-sky-300 hover:text-sky-200" type="button" onClick={() => setSelectedTrade(trade)}>
                        View{trade.imageData ? " · Image" : ""}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <dialog
        ref={dialogRef}
        className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/80"
        aria-labelledby="trade-details-title"
        onClose={() => setSelectedTrade(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedTrade(null);
        }}
      >
        {selectedTrade && (
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-sky-300">Trade details</p>
                <h2 className="mt-1 text-xl font-semibold" id="trade-details-title">{selectedTrade.symbol} · {selectedTrade.side}</h2>
                <p className="mt-1 text-sm text-slate-400">{selectedTrade.date} {selectedTrade.time ?? ""}</p>
              </div>
              <button className="button-quiet min-h-10" type="button" onClick={() => setSelectedTrade(null)} aria-label="Close trade details">Close</button>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["Result", selectedTrade.result],
                ["P&L", formatCurrency(selectedTrade.pnl, currency)],
                ["Position size", selectedTrade.size],
                ["Entry price", selectedTrade.entryPrice],
                ["Exit price", selectedTrade.exitPrice],
                ["Stop loss", selectedTrade.stopLoss],
                ["Take profit", selectedTrade.takeProfit],
                ["R-Multiple", selectedTrade.rMultiple == null ? undefined : `${selectedTrade.rMultiple.toFixed(2)}R`],
              ].map(([label, value]) => (
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3" key={label}>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm text-slate-200">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
            {selectedTrade.notes && (
              <section className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-300">{selectedTrade.notes}</p>
              </section>
            )}
            {selectedTrade.imageData && (
              <section className="mt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Uploaded screenshot</h3>
                <img className="max-h-[55vh] w-full rounded-lg border border-slate-800 object-contain" src={selectedTrade.imageData} alt={`Screenshot for ${selectedTrade.symbol} trade on ${selectedTrade.date}`} />
              </section>
            )}
          </div>
        )}
      </dialog>
    </section>
  );
}
