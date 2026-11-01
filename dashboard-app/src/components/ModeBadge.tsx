import { MODE_LABELS, type Mode } from "../types";

const classes: Record<Mode, string> = {
  backtesting: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  broker: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  propfirm: "border-violet-400/20 bg-violet-400/10 text-violet-300",
};

export function ModeBadge({ mode }: { mode: Mode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${classes[mode]}`}>
      {MODE_LABELS[mode]}
    </span>
  );
}
