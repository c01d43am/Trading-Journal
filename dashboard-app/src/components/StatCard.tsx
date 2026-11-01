interface StatCardProps {
  label: string;
  value: string;
  detail?: string;
  tone?: "blue" | "green" | "purple" | "amber" | "red";
  valueTone?: "green" | "red";
}

const toneClasses = {
  blue: "text-sky-300 bg-sky-400/10",
  green: "text-emerald-300 bg-emerald-400/10",
  purple: "text-violet-300 bg-violet-400/10",
  amber: "text-amber-300 bg-amber-400/10",
  red: "text-rose-300 bg-rose-400/10",
};

export function StatCard({ label, value, detail, tone = "blue", valueTone }: StatCardProps) {
  const valueColor = valueTone === "green"
    ? "text-emerald-300"
    : valueTone === "red"
      ? "text-rose-300"
      : "text-slate-100";
  return (
    <article className="panel min-w-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{label}</span>
        <span className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${toneClasses[tone]}`}>MOCK</span>
      </div>
      <strong className={`mt-5 block break-words text-xl font-semibold leading-tight tracking-tight sm:text-2xl xl:text-3xl ${valueColor}`}>{value}</strong>
      {detail && <p className="mt-1 break-words text-xs leading-5 text-slate-500">{detail}</p>}
    </article>
  );
}
