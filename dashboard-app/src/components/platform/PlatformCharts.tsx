import { useEffect, useRef } from "react";
import {
  Chart as ChartJS,
  registerables,
  type ChartConfiguration,
  type ChartType,
} from "chart.js";
import {
  balanceTimeline,
  durationBuckets,
  durationScatter,
  instrumentPerformance,
} from "../../data/platformDashboard";

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
        displayColors: true,
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

export function ScoreRadar() {
  const config: ChartConfiguration<"radar"> = {
    type: "radar",
    data: {
      labels: ["Consistency", "SL Usage", "WR", "RR"],
      datasets: [{
        data: [44, 71, 47, 34],
        borderColor: "#60a5fa",
        backgroundColor: "rgba(37, 99, 235, .25)",
        pointBackgroundColor: "#93c5fd",
        pointBorderColor: "#0f172a",
        pointRadius: 3,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: chartOptions().plugins.tooltip },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: "rgba(183, 199, 222, .13)" },
          angleLines: { color: "rgba(183, 199, 222, .13)" },
          pointLabels: { color: "#b7c2d1", font: { size: 10 } },
        },
      },
    },
  };
  return <ChartCanvas config={config} label="Trading score radar chart" />;
}

export function AccountBalanceChart({ range }: { range: "Last 7 days" | "Last 30 days" | "This month" }) {
  const start = range === "Last 7 days" ? Math.max(0, balanceTimeline.labels.length - 7) : 0;
  const labels = balanceTimeline.labels.slice(start);
  const balance = balanceTimeline.balance.slice(start);
  const equity = balanceTimeline.equity.slice(start);
  const config: ChartConfiguration<"line"> = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Balance",
          data: balance,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(37, 99, 235, .10)",
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
          tension: 0.32,
          fill: true,
        },
        {
          label: "Equity",
          data: equity,
          borderColor: "#25c690",
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
          borderDash: [5, 4],
          tension: 0.32,
        },
      ],
    },
    options: {
      ...chartOptions(true),
      interaction: { mode: "index", intersect: false },
      scales: {
        ...chartOptions(true).scales,
        y: {
          ...chartOptions(true).scales.y,
          min: 4650,
          max: 5100,
          ticks: {
            ...chartOptions(true).scales.y.ticks,
            stepSize: 100,
            callback: (value: string | number) => `$${Number(value).toLocaleString()}`,
          },
        },
      },
    },
  };
  return <ChartCanvas config={config} label="Account balance and equity over time" />;
}

export function DurationBoxPlot() {
  const plot = { left: 44, right: 12, top: 13, bottom: 36 };
  const width = 520;
  const height = 265;
  const min = -60;
  const max = 80;
  const y = (value: number) => plot.top + ((max - value) / (max - min)) * (height - plot.top - plot.bottom);
  const slot = (width - plot.left - plot.right) / durationBuckets.length;
  const x = (index: number) => plot.left + slot * (index + 0.5);

  return (
    <svg className="duration-boxplot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Profit and loss distribution by trade duration">
      {[-50, 0, 50].map((tick) => (
        <g key={tick}>
          <line x1={plot.left} x2={width - plot.right} y1={y(tick)} y2={y(tick)} stroke="rgba(151,164,184,.14)" strokeDasharray="3 5" />
          <text x={plot.left - 8} y={y(tick) + 4} textAnchor="end" fill="#768395" fontSize="10">${tick}</text>
        </g>
      ))}
      {durationBuckets.map((bucket, index) => {
        const center = x(index);
        const boxTop = y(bucket.q3);
        const boxBottom = y(bucket.q1);
        const positive = bucket.median >= 0;
        return (
          <g key={bucket.label}>
            <line x1={center} x2={center} y1={y(bucket.high)} y2={y(bucket.low)} stroke="#596579" strokeWidth="1.5" />
            <line x1={center - 8} x2={center + 8} y1={y(bucket.high)} y2={y(bucket.high)} stroke="#596579" />
            <line x1={center - 8} x2={center + 8} y1={y(bucket.low)} y2={y(bucket.low)} stroke="#596579" />
            <rect x={center - 17} y={boxTop} width="34" height={Math.max(3, boxBottom - boxTop)} rx="4" fill={positive ? "rgba(34,197,94,.20)" : "rgba(239,68,68,.18)"} stroke={positive ? "#22c55e" : "#ef4444"} />
            <line x1={center - 17} x2={center + 17} y1={y(bucket.median)} y2={y(bucket.median)} stroke={positive ? "#4ade80" : "#fb7185"} strokeWidth="2" />
            <text x={center} y={height - 12} textAnchor="middle" fill="#8995a5" fontSize="9">{bucket.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function DurationScatterChart() {
  const config: ChartConfiguration<"scatter"> = {
    type: "scatter",
    data: {
      datasets: [
        { label: "Winning trades", data: durationScatter.wins, backgroundColor: "#22c55e", pointRadius: 4, pointHoverRadius: 6 },
        { label: "Losing trades", data: durationScatter.losses, backgroundColor: "#ef4444", pointRadius: 4, pointHoverRadius: 6 },
      ],
    },
    options: {
      ...chartOptions(true),
      scales: {
        x: {
          title: { display: true, text: "Duration (minutes)", color: axisColor, font: { size: 10 } },
          grid: { display: false },
          ticks: { color: axisColor },
          border: { color: "#303847" },
        },
        y: {
          title: { display: true, text: "Profit / loss", color: axisColor, font: { size: 10 } },
          grid: { color: gridColor },
          ticks: { color: axisColor, callback: (value: string | number) => `$${value}` },
          border: { display: false },
        },
      },
    },
  };
  return <ChartCanvas config={config} label="Profit and loss by trade duration scatter plot" />;
}

export function InstrumentProfitChart() {
  const config: ChartConfiguration<"bar"> = {
    type: "bar",
    data: {
      labels: instrumentPerformance.labels,
      datasets: [
        { label: "Profit", data: instrumentPerformance.profit, backgroundColor: "rgba(34,197,94,.84)", borderRadius: 4, barThickness: 12, stack: "pnl" },
        { label: "Loss", data: instrumentPerformance.loss, backgroundColor: "rgba(239,68,68,.8)", borderRadius: 4, barThickness: 12, stack: "pnl" },
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
  return <ChartCanvas config={config} label="Instrument profit and loss stacked bar chart" />;
}

export function InstrumentVolumeChart() {
  const config: ChartConfiguration<"bar"> = {
    type: "bar",
    data: {
      labels: instrumentPerformance.labels,
      datasets: [{
        label: "Lots",
        data: instrumentPerformance.volume,
        backgroundColor: ["#3b82f6", "#2563eb", "#4f46e5", "#0ea5e9", "#6366f1", "#60a5fa"],
        borderRadius: 5,
        maxBarThickness: 30,
      }],
    },
    options: {
      ...chartOptions(),
      plugins: { ...chartOptions().plugins, legend: { display: false } },
      scales: {
        ...chartOptions().scales,
        y: { ...chartOptions().scales.y, beginAtZero: true, ticks: { color: axisColor, callback: (value) => `${value} lots` } },
      },
    },
  };
  return <ChartCanvas config={config} label="Trading volume by instrument" />;
}
