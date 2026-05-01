import type { OptimizationSignal } from "@/lib/plan-types";
import {
  countSignalsBySeverity,
  groupSignalsByKind,
  SIGNAL_KIND_LABELS,
  type SignalSeverity,
} from "./signal-panel-helpers";

const SEVERITY_STYLES: Record<SignalSeverity, { badge: string; dot: string; border: string; label: string }> = {
  info: {
    badge: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    dot: "bg-blue-400",
    border: "border-blue-500/20 bg-blue-500/5",
    label: "info",
  },
  warning: {
    badge: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    dot: "bg-amber-400",
    border: "border-amber-500/20 bg-amber-500/5",
    label: "warning",
  },
  risk: {
    badge: "bg-red-500/10 text-red-300 border-red-500/20",
    dot: "bg-red-400",
    border: "border-red-500/20 bg-red-500/5",
    label: "risk",
  },
};

export default function SignalPanel({ signals, open, onToggle }: {
  signals: OptimizationSignal[];
  open: boolean;
  onToggle: () => void;
}) {
  const grouped = groupSignalsByKind(signals);
  const counts = countSignalsBySeverity(signals);
  const total = signals.length;
  const highestSeverity: SignalSeverity = counts.risk > 0 ? "risk" : counts.warning > 0 ? "warning" : "info";
  const styles = SEVERITY_STYLES[highestSeverity];

  return (
    <div className={`rounded-xl border ${total > 0 ? styles.border : "border-[#1e1e34] bg-[#0e0e1c]"} overflow-hidden transition-all`}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors text-left"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${total > 0 ? styles.dot : "bg-green-500"}`} />
          <div>
            <span className="text-sm font-semibold text-[#d0d0e8]">Plan Signals</span>
            <span className="text-xs text-[#6a6a8a] ml-2">
              {total === 0 ? "No active signals" : `${total} active signal${total !== 1 ? "s" : ""}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {total > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-[10px]">
              {counts.risk > 0 && <SeverityPill severity="risk" count={counts.risk} />}
              {counts.warning > 0 && <SeverityPill severity="warning" count={counts.warning} />}
              {counts.info > 0 && <SeverityPill severity="info" count={counts.info} />}
            </div>
          )}
          <svg
            className={`w-4 h-4 text-[#6a6a8a] transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-[#1e1e34] p-4 space-y-4">
          {total === 0 ? (
            <p className="text-xs text-green-400/80">No semester load, prerequisite bottleneck, delayed critical course, or graduation risk signals are active for this plan.</p>
          ) : (
            grouped.map(({ kind, signals: kindSignals }) => (
              <div key={kind}>
                <h4 className="text-xs text-[#8888a8] uppercase tracking-wide mb-2 font-medium">
                  {SIGNAL_KIND_LABELS[kind]} ({kindSignals.length})
                </h4>
                {kindSignals.length === 0 ? (
                  <p className="text-xs text-[#4a4a6a]">No active signals.</p>
                ) : (
                  <div className="space-y-2">
                    {kindSignals.map((signal) => (
                      <div key={signal.id} className="flex items-start gap-2 text-xs bg-[#0e0e1c] border border-[#1e1e34] rounded-lg px-3 py-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_STYLES[signal.severity].dot} shrink-0 mt-1.5`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-1.5 py-0.5 rounded border text-[9px] uppercase tracking-wider ${SEVERITY_STYLES[signal.severity].badge}`}>
                              {SEVERITY_STYLES[signal.severity].label}
                            </span>
                            <ScopeLabel signal={signal} />
                          </div>
                          <p className="text-[#c8c8df] leading-snug">{signal.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SeverityPill({ severity, count }: { severity: SignalSeverity; count: number }) {
  return (
    <span className={`px-1.5 py-0.5 rounded border uppercase tracking-wider ${SEVERITY_STYLES[severity].badge}`}>
      {count} {SEVERITY_STYLES[severity].label}
    </span>
  );
}

function ScopeLabel({ signal }: { signal: OptimizationSignal }) {
  const scope = signal.scope;
  const label = scope.type === "semester"
    ? scope.term
    : scope.type === "course"
      ? scope.courseId.replaceAll("-", " ")
      : "plan";

  return <span className="text-[10px] text-[#6a6a8a] font-mono truncate">{label}</span>;
}
