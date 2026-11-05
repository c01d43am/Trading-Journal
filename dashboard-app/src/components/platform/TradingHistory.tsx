import { tradingHistory } from "../../data/platformDashboard";
import { PlatformIcon } from "./platformIcons";

function formatProfit(value: number) {
  const formatted = Math.abs(value).toFixed(2);
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function TradingHistory({ onShare }: { onShare: () => void }) {
  return (
    <section className="platform-panel platform-history-panel">
      <div className="platform-history-header">
        <div>
          <span className="platform-kicker">ACCOUNT ACTIVITY</span>
          <h2>Trading history</h2>
          <p>Latest closed positions for this account</p>
        </div>
        <button className="platform-button platform-button-quiet" type="button" onClick={onShare}>
          <PlatformIcon name="share" size={15} /> Share
        </button>
      </div>
      <div className="platform-table-scroll">
        <table className="platform-history-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Type</th>
              <th>Open date</th>
              <th>Open price</th>
              <th>Closed date</th>
              <th>Closed price</th>
              <th>TP</th>
              <th>SL</th>
              <th>Lots</th>
              <th>Commission</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            {tradingHistory.map((trade, index) => (
              <tr key={`${trade.symbol}-${trade.openDate}-${index}`}>
                <td className="platform-symbol-cell">{trade.symbol}</td>
                <td><span className={`platform-side-tag ${trade.type === "Buy" ? "side-buy" : "side-sell"}`}>{trade.type}</span></td>
                <td>{trade.openDate}</td>
                <td>{trade.openPrice}</td>
                <td>{trade.closedDate}</td>
                <td>{trade.closedPrice}</td>
                <td className="platform-muted-cell">{trade.tp}</td>
                <td className="platform-muted-cell">{trade.sl}</td>
                <td>{trade.lots}</td>
                <td className="platform-muted-cell">{trade.commission}</td>
                <td className={trade.profit >= 0 ? "is-positive" : "is-negative"}>{formatProfit(trade.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="platform-history-footer"><span>Showing 8 of 76 trades</span><button type="button" disabled>View all trades <span aria-hidden="true">→</span></button></div>
    </section>
  );
}
