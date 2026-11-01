import { useEffect, useRef } from "react";
import {
  Chart as ChartJS,
  registerables,
  type Plugin,
} from "chart.js";
import type { EquityPoint } from "../types";

ChartJS.register(...registerables);

interface EquityChartProps {
  points: EquityPoint[];
  currency: string;
  title?: string;
  subtitle?: string;
  color?: string;
}

const crosshairPlugin: Plugin<"line"> = {
  id: "equity-crosshair",
  afterDraw(chart) {
    const activeElement = chart.tooltip?.getActiveElements()[0];
    if (!activeElement) return;

    const { ctx, chartArea } = chart;
    const { x, y } = activeElement.element;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.strokeStyle = "rgba(203, 213, 225, 0.65)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#e2e8f0";
    ctx.fill();
    ctx.restore();
  },
};

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(timestamp: string, fallback: string) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatAxisDate(timestamp: string, fallback: string) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function EquityChart({
  points,
  currency,
  title = "Equity curve",
  subtitle = "Starting capital plus recorded journal trades",
  color = "#62a8ff",
}: EquityChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentEquity = points.at(-1)?.value ?? 0;
  const startingCapital = points[0]?.value ?? 0;
  const lineColor = currentEquity > startingCapital
    ? "#4bd6a0"
    : currentEquity < startingCapital
      ? "#fa7c88"
      : color;
  const formattedEquity = formatCurrency(currentEquity, currency);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;

    const values = points.map((point) => point.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const padding = (maximum - minimum) * 0.15 || Math.max(Math.abs(startingCapital) * 0.01, 1);
    const chart = new ChartJS(canvas, {
      type: "line",
      data: {
        labels: points.map((point) => formatAxisDate(point.timestamp ?? "", point.label)),
        datasets: [{
          data: values,
          borderColor: lineColor,
          backgroundColor: `${lineColor}22`,
          borderWidth: 2,
          pointRadius: (context) => context.dataIndex === 0 ? 3 : 0,
          pointHoverRadius: 4,
          pointBackgroundColor: lineColor,
          fill: true,
          tension: 0.25,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false, axis: "x" },
        animation: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#81909e", autoSkip: true, maxTicksLimit: 7, maxRotation: 0 },
            border: { color: "#26333e" },
          },
          y: {
            min: minimum - padding,
            max: maximum + padding,
            grid: { color: "rgba(148, 163, 184, 0.12)", tickBorderDash: [4, 4] },
            ticks: {
              color: "#81909e",
              callback: (value) => formatCurrency(Number(value), currency),
            },
            border: { color: "#26333e", dash: [4, 4] },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            displayColors: false,
            callbacks: {
              title: (items) => {
                const point = points[items[0]?.dataIndex ?? 0];
                return point ? formatDateTime(point.timestamp ?? "", point.label) : "";
              },
              label: (context) => context.parsed.y === null
                ? ""
                : `Equity: ${formatCurrency(context.parsed.y, currency)}`,
            },
          },
        },
      },
      plugins: [crosshairPlugin],
    });

    return () => chart.destroy();
  }, [currency, lineColor, points, startingCapital]);

  return (
    <section className="panel min-w-0">
      <div className="mb-5 flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="section-title">{title}</h2>
          <p className="section-subtitle">{subtitle}</p>
        </div>
        <strong className="shrink-0 text-xl font-semibold text-slate-100">{formattedEquity}</strong>
      </div>
      <div className="h-[250px] w-full min-w-0 touch-pan-y sm:h-[400px]">
        <canvas ref={canvasRef} role="img" aria-label={`${title}: ${formattedEquity}`} />
      </div>
    </section>
  );
}
