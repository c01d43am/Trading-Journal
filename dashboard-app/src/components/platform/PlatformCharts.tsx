import { useEffect, useRef } from "react";
import { format, parseISO, startOfMonth, subDays } from "date-fns";
import {
  Chart as ChartJS,
  registerables,
  type ChartConfiguration,
  type ChartType,
} from "chart.js";
import type { Trade } from "../../types";

ChartJS.register(...registerables);

function ChartCanvas({
  config,
  label,
  className = "platform-chart-canvas",
}: {
  config: ChartConfiguration<ChartType>;
  label: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = new ChartJS(canvasRef.current, config);
    return () => chart.destroy();
  }, [config]);

  return <canvas className={className} ref={canvasRef} role="img" aria-label={label} />;
}

function EmptyChart({ children }: { children: string }) {
  return <p className="platform-empty-chart">{children}</p>;
}

const axisColor = "#768395";
const gridColor = "rgba(151, 164, 184, .11)";

function chartOptions(currencyAxis = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        display: true,
        position: "bottom" as const,
        labels: { color: "#a9b4c3", boxWidth: 7, boxHeight: 7, usePointStyle: true, padding: 18 },
      },
      tooltip: {
        backgroundColor: "#111720",
        borderColor: "#303a49",
        borderWidth: 1,
        titleColor: "#f4f6fb",
        bodyColor: "#c5ceda",
        padding: 11,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: axisColor, maxRotation: 0, autoSkip: true },
        border: { color: "#303847" },
      },
      y: {
        grid: { color: gridColor },
        ticks: {
          color: axisColor,
          callback: (value: string | number) => currencyAxis
            ? `$${Number(value).toLocaleString()}`
            : value,
        },
        border: { display: false },
      },
    },
  };
}

function sortTrades(trades: Trade[]) {
  return trades.slice().sort((left, right) =>
    `${left.date} ${left.time ?? ""}`.localeCompare(`${right.date} ${right.time ?? ""}`),
  );
}

function getRangeStart(range: "Last 7 days" | "Last 30 days" | "This month") {
  const today = new Date();
  if (range === "This month") return format(startOfMonth(today), "yyyy-MM-dd");
  return format(subDays(today, range === "Last 7 days" ? 6 : 29), "yyyy-MM-dd");
}

export function AccountBalanceChart({
  range,
  capital,
  trades,
}: {
  range: "Last 7 days" | "Last 30 days" | "This month";
  capital: number;
  trades: Trade[];
}) {
  const rangeStart = getRangeStart(range);
  const orderedTrades = sortTrades(trades);
  const visibleTrades = orderedTrades.filter((trade) => trade.date.slice(0, 10) >= rangeStart);
  if (!visibleTrades.length) return <EmptyChart>Record trades in this period to see the account balance.</EmptyChart>;

  const priorPnl = orderedTrades
    .filter((trade) => trade.date.slice(0, 10) < rangeStart)
    .reduce((total, trade) => total + trade.pnl, 0);
  let balance = capital + priorPnl;
  const labels = [rangeStart === format(subDays(new Date(), 29), "yyyy-MM-dd") ? "Before period" : "Start"];
  const values = [balance];
  for (const trade of visibleTrades) {
    balance += trade.pnl;
    const date = parseISO(trade.date.slice(0, 10));
    labels.push(`${format(date, "MMM d")}${trade.time ? ` ${trade.time}` : ""}`);
    values.push(Math.round(balance * 100) / 100);
  }

  const config: ChartConfiguration<"line"> = {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Balance",
        data: values,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(37, 99, 235, .10)",
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
        tension: 0.25,
        fill: true,
      }],
    },
    options: {
      ...chartOptions(true),
      scales: {
        ...chartOptions(true).scales,
        y: { ...chartOptions(true).scales.y, beginAtZero: false },
      },
    },
  };
  return <ChartCanvas config={config} label="Recorded account balance by trade" />;
}

export function TradeOutcomesChart({ trades }: { trades: Trade[] }) {
  if (!trades.length) return <EmptyChart>Add trades to see your win and loss breakdown.</EmptyChart>;
  const counts = [
    trades.filter((trade) => trade.pnl > 0).length,
    trades.filter((trade) => trade.pnl < 0).length,
    trades.filter((trade) => trade.pnl === 0).length,
  ];
  const config: ChartConfiguration<"doughnut"> = {
    type: "doughnut",
    data: {
      labels: ["Wins", "Losses", "Breakeven"],
      datasets: [{
        data: counts,
        backgroundColor: ["#22c55e", "#ef4444", "#64748b"],
        borderColor: "#151a23",
        borderWidth: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { color: "#a9b4c3", boxWidth: 7, boxHeight: 7, usePointStyle: true },
        },
      },
    },
  };
  return <ChartCanvas config={config} label="Recorded winning, losing, and breakeven trades" />;
}

function groupBySymbol(trades: Trade[]) {
  const groups = new Map<string, { profit: number; loss: number; volume: number }>();
  for (const trade of trades) {
    const symbol = trade.symbol.trim();
    const group = groups.get(symbol) ?? { profit: 0, loss: 0, volume: 0 };
    if (trade.pnl > 0) group.profit += trade.pnl;
    if (trade.pnl < 0) group.loss += trade.pnl;
    group.volume += trade.size ?? 0;
    groups.set(symbol, group);
  }
  return [...groups.entries()].sort((left, right) =>
    (right[1].profit + right[1].loss) - (left[1].profit + left[1].loss),
  );
}

export function InstrumentProfitChart({ trades }: { trades: Trade[] }) {
  if (!trades.length) return <EmptyChart>Add trades to see profit by instrument.</EmptyChart>;
  const grouped = groupBySymbol(trades);
  const config: ChartConfiguration<"bar"> = {
    type: "bar",
    data: {
      labels: grouped.map(([symbol]) => symbol),
      datasets: [
        { label: "Wins", data: grouped.map(([, value]) => value.profit), backgroundColor: "rgba(34,197,94,.84)", borderRadius: 4, barThickness: 12, stack: "pnl" },
        { label: "Losses", data: grouped.map(([, value]) => value.loss), backgroundColor: "rgba(239,68,68,.8)", borderRadius: 4, barThickness: 12, stack: "pnl" },
      ],
    },
    options: {
      ...chartOptions(true),
      indexAxis: "y",
      scales: {
        x: { ...chartOptions(true).scales.y, stacked: true },
        y: { ...chartOptions(true).scales.x, stacked: true },
      },
    },
  };
  return <ChartCanvas config={config} label="Recorded profit and loss by instrument" />;
}

export function InstrumentVolumeChart({ trades }: { trades: Trade[] }) {
  const grouped = groupBySymbol(trades).filter(([, values]) => values.volume > 0);
  if (!grouped.length) return <EmptyChart>Add a position size to a trade to see volume by instrument.</EmptyChart>;
  const config: ChartConfiguration<"bar"> = {
    type: "bar",
    data: {
      labels: grouped.map(([symbol]) => symbol),
      datasets: [{
        label: "Position size",
        data: grouped.map(([, values]) => values.volume),
        backgroundColor: "#3b82f6",
        borderRadius: 5,
        maxBarThickness: 30,
      }],
    },
    options: {
      ...chartOptions(),
      plugins: { ...chartOptions().plugins, legend: { display: false } },
      scales: {
        ...chartOptions().scales,
        y: { ...chartOptions().scales.y, beginAtZero: true },
      },
    },
  };
  return <ChartCanvas config={config} label="Recorded position size by instrument" />;
}
