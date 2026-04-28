interface ProgressBarProps {
  label: string;
  completed: number;
  inProgress?: number;
  total: number;
  unit?: "courses" | "hours";
  showCounts?: boolean;
}

export default function ProgressBar({
  label,
  completed,
  inProgress = 0,
  total,
  unit = "courses",
  showCounts = true,
}: ProgressBarProps) {
  const pct = total > 0 ? Math.min((completed / total) * 100, 100) : 0;
  const ipPct = total > 0 ? Math.min((inProgress / total) * 100, 100 - pct) : 0;
  const done = completed >= total;

  const barColor =
    done ? "bg-green-500"
    : pct >= 66 ? "bg-[#d4a843]"
    : pct >= 33 ? "bg-indigo-500"
    : "bg-indigo-700";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className={`font-medium ${done ? "text-green-400" : "text-[#c0c0d8]"}`}>
          {done && (
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-green-500/20 text-green-400 text-[9px] mr-1.5">✓</span>
          )}
          {label}
        </span>
        {showCounts && (
          <span className="text-xs text-[#6a6a8a] tabular-nums">
            {completed}
            {inProgress > 0 && <span className="text-[#d4a843]"> +{inProgress}</span>}
            {" / "}
            {total} {unit}
          </span>
        )}
      </div>
      <div className="h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden flex">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${pct}%` }}
        />
        {ipPct > 0 && (
          <div
            className="h-full bg-[#d4a843]/30 transition-all duration-700 ease-out"
            style={{ width: `${ipPct}%` }}
          />
        )}
      </div>
    </div>
  );
}
