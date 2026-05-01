import type { OptimizationSignal } from "@/lib/plan-types";

export type SignalKind = OptimizationSignal["kind"];
export type SignalSeverity = OptimizationSignal["severity"];

export const SIGNAL_KIND_LABELS: Record<SignalKind, string> = {
  semester_load: "Semester load",
  prereq_bottleneck: "Prereq bottlenecks",
  delayed_critical_course: "Delayed critical courses",
  graduation_risk: "Graduation risks",
};

export const SIGNAL_KIND_ORDER: SignalKind[] = [
  "semester_load",
  "prereq_bottleneck",
  "delayed_critical_course",
  "graduation_risk",
];

const SEVERITY_RANK: Record<SignalSeverity, number> = {
  risk: 0,
  warning: 1,
  info: 2,
};

export function groupSignalsByKind(signals: OptimizationSignal[]): Array<{ kind: SignalKind; signals: OptimizationSignal[] }> {
  return SIGNAL_KIND_ORDER.map((kind) => ({
    kind,
    signals: signals
      .filter((signal) => signal.kind === kind)
      .sort((a, b) => {
        const severityDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (severityDelta !== 0) return severityDelta;
        return a.id.localeCompare(b.id);
      }),
  }));
}

export function countSignalsBySeverity(signals: OptimizationSignal[]): Record<SignalSeverity, number> {
  return signals.reduce<Record<SignalSeverity, number>>(
    (counts, signal) => {
      counts[signal.severity] += 1;
      return counts;
    },
    { info: 0, warning: 0, risk: 0 },
  );
}
