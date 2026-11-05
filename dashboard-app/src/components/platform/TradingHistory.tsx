import { useState } from "react";
import type { Trade } from "../../types";
import { PlatformIcon } from "./platformIcons";

function formatPrice(value: number | undefined) {
  return value === undefined ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 5 });
}

function formatProfit(value: number) {
  return `${value < 0 ? "-$" : "$"}${Math.abs(value).toFixed(2)}`;
}

export function TradingHistory({
  trades,
  onShare,
  onDeleteTrade,
  onClearTrades,
}: {
  trades: Trade[];
  onShare: () => void;
  onDeleteTrade: (tradeId: string) => void;
  onClearTrades: () => void;
}) {
  const [confirmation, setConfirmation] = useState<{ type: "trade"; id: string } | { type: "all" } | null>(null);
  const confirmedTrade = confirmation?.type === "trade"
    ? trades.find((trade) => trade.id === confirmation.id)
    : undefined;

  return (
    <section className="platform-panel platform-history-panel">
      <div className="platform-history-header">
        <div>
          <span className="platform-kicker">ACCOUNT ACTIVITY</span>
          <h2>Trading history ({trades.length})</h2>
          <p>Trades saved to this profile</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {trades.length > 0 && (
            <button
              className="platform-button platform-button-quiet"
              type="button"
              onClick={() => setConfirmation({ type: "all" })}
            >
              Clear trades
            </button>
          )}
          <button className="platform-button platform-button-quiet" type="button" onClick={onShare}>
            <PlatformIcon name="share" size={15} /> Share
          </button>
        </div>
      </div>
      <div className="platform-table-scroll">
        <table className="platform-history-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Date</th>
              <th>Time</th>
              <th>Size</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>Stop loss</th>
              <th>Take profit</th>
              <th>P&amp;L</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr><td colSpan={11}>No trades yet. Use Add trade to record your first trade.</td></tr>
            ) : trades.slice().sort((left, right) =>
              `${right.date} ${right.time ?? ""}`.localeCompare(`${left.date} ${left.time ?? ""}`),
            ).map((trade) => (
              <tr key={trade.id}>
                <td className="platform-symbol-cell">{trade.symbol}</td>
                <td><span className={`platform-side-tag ${trade.side === "Long" ? "side-buy" : "side-sell"}`}>{trade.side}</span></td>
                <td>{trade.date}</td>
                <td>{trade.time ?? "—"}</td>
                <td>{formatPrice(trade.size)}</td>
                <td>{formatPrice(trade.entryPrice)}</td>
                <td>{formatPrice(trade.exitPrice)}</td>
                <td className="platform-muted-cell">{formatPrice(trade.stopLoss)}</td>
                <td className="platform-muted-cell">{formatPrice(trade.takeProfit)}</td>
                <td className={trade.pnl >= 0 ? "is-positive" : "is-negative"}>{formatProfit(trade.pnl)}</td>
                <td>
                  <button
                    className="platform-danger-text"
                    type="button"
                    aria-label={`Delete ${trade.symbol} trade from ${trade.date}`}
                    onClick={() => setConfirmation({ type: "trade", id: trade.id })}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="platform-history-footer"><span>{trades.length} saved {trades.length === 1 ? "trade" : "trades"}</span></div>
      {confirmation && (
        <div className="platform-dialog-backdrop">
          <section className="platform-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-trades-title">
            <h2 id="delete-trades-title">
              {confirmation.type === "all" ? "Clear all trades?" : "Delete this trade?"}
            </h2>
            <p>
              {confirmation.type === "all"
                ? `This permanently deletes all ${trades.length} trades from this profile.`
                : confirmedTrade
                  ? `This permanently deletes the ${confirmedTrade.symbol} trade from ${confirmedTrade.date}.`
                  : "This trade is no longer available."}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button className="platform-button platform-button-quiet" type="button" onClick={() => setConfirmation(null)}>
                Cancel
              </button>
              <button
                className="platform-button border border-rose-400/40 bg-rose-400/10 text-rose-300"
                type="button"
                disabled={confirmation.type === "trade" && !confirmedTrade}
                onClick={() => {
                  if (confirmation.type === "all") onClearTrades();
                  else onDeleteTrade(confirmation.id);
                  setConfirmation(null);
                }}
              >
                Delete
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
