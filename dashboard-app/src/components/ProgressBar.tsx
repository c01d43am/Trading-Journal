interface ProgressBarProps {
  label: string;
  value: number;
  detail: string;
  inverse?: boolean;
}

export function ProgressBar({ label, value, detail, inverse = false }: ProgressBarProps) {
  const progress = Math.max(0, Math.min(100, value));
  const tone = inverse
    ? progress > 80 ? "bg-rose-400" : progress > 55 ? "bg-amber-300" : "bg-emerald-400"
    : progress > 80 ? "bg-emerald-400" : progress > 55 ? "bg-amber-300" : "bg-sky-400";
  return (
    <div>
      <div className="mb-2 flex justify-between gap-3 text-xs">
        <span className="font-medium text-slate-300">{label}</span>
        <span className="text-slate-500">{detail}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full transition-all duration-700 ${tone}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
