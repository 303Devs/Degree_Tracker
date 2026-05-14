"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildAuditDashboardViewModel,
  type AuditDashboardViewModel,
  type DashboardRequirement,
  type DashboardRequirementStatus,
} from "@/lib/audit-dashboard-view";
import { filterVisibleDashboardActions, getDashboardActionLocalStates } from "@/lib/dashboard-action-state";
import type { Course, EntityLocalState, RequirementGroup, Semester } from "@/lib/types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; courses: Course[]; requirements: RequirementGroup[]; semesters: Semester[]; actionStates: EntityLocalState[] };

const sectionCopy: Record<DashboardRequirementStatus, { title: string; detail: string }> = {
  attention: { title: "Needs attention", detail: "Review these before relying on your plan." },
  in_progress: { title: "In progress or planned", detail: "These are already moving; confirm they still fit." },
  remaining: { title: "Still remaining", detail: "Pick from these areas when choosing future courses." },
  complete: { title: "Complete", detail: "Finished areas are quieter by default." },
};

// Used for the small dot in RequirementSection summary header (kept for reference)
// Section accent bars now handled inline via CSS variables
const statusTone: Record<DashboardRequirementStatus, string> = {
  attention: "bg-rose-500",
  in_progress: "bg-amber-500",
  remaining: "bg-slate-400",
  complete: "bg-green-600",
};

// Count badge tints per section status
const sectionBadgeTone: Record<DashboardRequirementStatus, string> = {
  attention: "border-rose-200 bg-rose-50 text-rose-700",
  in_progress: "border-amber-200 bg-amber-50 text-amber-700",
  remaining: "border-slate-200 bg-slate-50 text-slate-600",
  complete: "border-green-200 bg-green-50 text-green-700",
};

// Top-border accent color class per section
const sectionTopBar: Record<DashboardRequirementStatus, string> = {
  attention: "border-t-rose-400",
  in_progress: "border-t-amber-400",
  remaining: "border-t-slate-300",
  complete: "border-t-green-500",
};

const progressTone: Record<DashboardRequirementStatus, string> = {
  attention: "bg-gradient-to-r from-rose-500 to-rose-400",
  in_progress: "bg-gradient-to-r from-amber-500 to-amber-400",
  remaining: "bg-gradient-to-r from-slate-400 to-slate-300",
  complete: "bg-gradient-to-r from-green-600 to-green-500",
};

const nextActionLabels = ["Review first", "Confirm timing", "Choose next course"];

async function fetchDashboardJson<T>(label: string, url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} request failed (${response.status})`);
  }

  try {
    return await response.json() as T;
  } catch {
    throw new Error(`${label} response was not valid JSON`);
  }
}

export default function AuditDashboard() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    Promise.all([
      fetchDashboardJson<Course[]>("courses", "/api/courses"),
      fetchDashboardJson<RequirementGroup[]>("requirements", "/api/requirements"),
      fetchDashboardJson<Semester[]>("semesters", "/api/semesters"),
      fetchDashboardJson<EntityLocalState[]>("dashboard action state", "/api/dashboard-actions"),
    ])
      .then(([courseData, requirementData, semesterData, actionStateData]) => {
        setState({
          status: "ready",
          courses: Array.isArray(courseData) ? courseData : [],
          requirements: Array.isArray(requirementData) ? requirementData : [],
          semesters: Array.isArray(semesterData) ? semesterData : [],
          actionStates: Array.isArray(actionStateData) ? actionStateData : [],
        });
      })
      .catch((error) => setState({ status: "error", message: error instanceof Error ? error.message : String(error) }));
  }, []);

  if (state.status === "loading") {
    return <PageShell><Surface className="flex min-h-56 items-center justify-center text-[var(--text-muted)]">Loading audit dashboard...</Surface></PageShell>;
  }

  if (state.status === "error") {
    return <PageShell><Surface className="break-words text-sm text-rose-600">Dashboard data did not load: {state.message}</Surface></PageShell>;
  }

  if (state.requirements.length === 0) {
    return (
      <PageShell>
        <Surface className="space-y-4 text-center">
          <p className="text-lg font-semibold text-[var(--text-primary)]">No audit loaded yet</p>
          <p className="text-sm text-[var(--text-secondary)]">Upload an audit to see your progress, next actions, and remaining requirements.</p>
          <a href="/upload" className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">Upload audit</a>
        </Surface>
      </PageShell>
    );
  }

  return <DashboardContent courses={state.courses} requirements={state.requirements} semesters={state.semesters} actionStates={state.actionStates} />;
}

function DashboardContent({ courses, requirements, semesters, actionStates }: { courses: Course[]; requirements: RequirementGroup[]; semesters: Semester[]; actionStates: EntityLocalState[] }) {
  const [localActionStates, setLocalActionStates] = useState(actionStates);
  const dashboard = useMemo(() => buildAuditDashboardViewModel({ courses, requirements, semesters }), [courses, requirements, semesters]);
  const visibleDashboard = useMemo(() => ({ ...dashboard, nextActions: filterVisibleDashboardActions(dashboard.nextActions, localActionStates) }), [dashboard, localActionStates]);

  async function updateAction(actionId: string, body: { dismissed?: boolean; snoozedUntil?: string | null; reason?: string }) {
    const response = await fetch(`/api/dashboard-actions/${actionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      const next = await fetchDashboardJson<EntityLocalState[]>("dashboard action state", "/api/dashboard-actions");
      setLocalActionStates(Array.isArray(next) ? next : []);
    }
  }

  async function resetAction(actionId: string) {
    const response = await fetch(`/api/dashboard-actions/${actionId}`, { method: "DELETE" });
    if (response.ok) {
      const next = await fetchDashboardJson<EntityLocalState[]>("dashboard action state", "/api/dashboard-actions");
      setLocalActionStates(Array.isArray(next) ? next : []);
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Hero dashboard={dashboard} />
        <NextActions dashboard={visibleDashboard} allActions={dashboard.nextActions} actionStates={localActionStates} onDismiss={(id) => updateAction(id, { dismissed: true, reason: "dismissed" })} onSnooze={(id) => { const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); updateAction(id, { dismissed: false, snoozedUntil: until, reason: "snoozed" }); }} onReset={resetAction} />
        <RequirementSections dashboard={dashboard} />
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen w-full overflow-x-hidden bg-[var(--page-bg)] px-3 py-4 pb-32 text-[var(--text-primary)] sm:px-6 sm:py-5 lg:px-8"><div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-5">{children}</div></div>;
}

function Surface({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:p-5 ${className}`}>{children}</section>;
}

function Hero({ dashboard }: { dashboard: AuditDashboardViewModel }) {
  const { summary } = dashboard;
  const statusText = summary.attentionRequirements > 0
    ? `${summary.attentionRequirements} area${summary.attentionRequirements === 1 ? "" : "s"} need attention`
    : summary.remainingRequirements > 0
      ? `${summary.remainingRequirements} area${summary.remainingRequirements === 1 ? "" : "s"} still remaining`
      : "Tracked requirements look complete";

  return (
    <Surface className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl min-w-0">
          <p className="text-xs font-semibold text-[var(--accent)]">Audit Dashboard</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">Are you on track?</h1>
          <p className="mt-2 hidden text-sm leading-6 text-[var(--text-secondary)] sm:block">Start here: see overall progress, the few things to review next, and which requirement areas still need a course decision.</p>
        </div>
        <div className="w-fit rounded-full border border-[var(--border)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] sm:text-sm">{statusText}</div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 sm:gap-3 md:grid-cols-4">
        <Metric label="requirements complete" value={`${summary.percentComplete}%`} detail={`${summary.completeRequirements} of ${summary.totalRequirements}`} tone={summary.percentComplete > 0 ? "complete" : "neutral"} />
        <Metric label="needs attention" value={String(summary.attentionRequirements)} detail="review first" tone={summary.attentionRequirements > 0 ? "attention" : "neutral"} />
        <Metric label="in progress" value={String(summary.inProgressRequirements)} detail={`${summary.creditsInProgress} credits active`} tone="progress" />
        <Metric label="planned credits" value={String(summary.creditsPlanned)} detail={`${summary.creditsCompleted} credits complete`} tone="accent" />
      </div>
    </Surface>
  );
}

type MetricTone = "complete" | "attention" | "progress" | "accent" | "neutral";

const metricToneClasses: Record<MetricTone, { container: string; value: string }> = {
  complete:  { container: "border-[var(--tile-complete-border)]  bg-[var(--tile-complete-bg)]",  value: "text-[var(--tile-complete-text)]"  },
  attention: { container: "border-[var(--tile-attention-border)] bg-[var(--tile-attention-bg)]", value: "text-[var(--tile-attention-text)]" },
  progress:  { container: "border-[var(--tile-progress-border)]  bg-[var(--tile-progress-bg)]",  value: "text-[var(--tile-progress-text)]"  },
  accent:    { container: "border-[var(--accent)] bg-[var(--accent-soft)]",                      value: "text-[var(--accent)]"              },
  neutral:   { container: "border-[var(--border)] bg-[var(--surface)]",                          value: "text-[var(--text-primary)]"        },
};

function Metric({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: MetricTone }) {
  const styles = metricToneClasses[tone];
  return (
    <div className={`min-w-0 rounded-2xl border p-3 sm:p-4 ${styles.container}`}>
      <div className={`break-words text-xl font-semibold sm:text-2xl ${styles.value}`}>{value}</div>
      <div className="mt-1 break-words text-[11px] font-medium text-[var(--text-secondary)] sm:text-xs">{label}</div>
      <div className="mt-2 break-words text-[11px] text-[var(--text-muted)] sm:text-xs">{detail}</div>
    </div>
  );
}

function NextActions({
  dashboard,
  allActions,
  actionStates,
  onDismiss,
  onSnooze,
  onReset,
}: {
  dashboard: AuditDashboardViewModel;
  allActions: AuditDashboardViewModel["nextActions"];
  actionStates: EntityLocalState[];
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  onReset: (id: string) => void;
}) {
  const hiddenStates = getDashboardActionLocalStates(actionStates).filter((state) => state.dismissed || (state.snoozedUntil && Date.parse(state.snoozedUntil) > Date.now()));
  return (
    <Surface className="min-w-0">
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">What to do next</h2>
          <p className="text-sm text-[var(--text-secondary)]">Based on where you stand right now.</p>
        </div>
      </div>
      <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-3">
        {dashboard.nextActions.slice(0, 3).map((action, index) => {
          const actionTone = index === 0
            ? { border: "border-l-rose-400",  label: "text-rose-600"  }
            : index === 1
            ? { border: "border-l-amber-400", label: "text-amber-700" }
            : { border: "border-l-[var(--accent)]", label: "text-[var(--accent)]" };

          return (
            <div key={action.id} className={`min-w-0 rounded-2xl border border-[var(--border)] border-l-4 ${actionTone.border} bg-[var(--surface)] p-3 sm:p-4`}>
              <div className={`flex items-center gap-2 text-xs font-semibold ${actionTone.label}`}>
                <span>{index + 1}</span>
                <span>{nextActionLabels[index] ?? "Next action"}</span>
              </div>
              <h3 className="mt-2 break-words text-sm font-semibold text-[var(--text-primary)]">{action.title}</h3>
              <p className="mt-2 break-words text-sm leading-6 text-[var(--text-secondary)]">{action.detail}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => onDismiss(action.id)} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]">Dismiss</button>
                <button onClick={() => onSnooze(action.id)} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]">Snooze 7 days</button>
              </div>
            </div>
          );
        })}
      </div>
      {hiddenStates.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <p className="text-xs font-semibold text-[var(--text-secondary)]">Hidden next actions</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {hiddenStates.map((state) => {
              const action = allActions.find((item) => item.id === state.entityId);
              return (
                <button key={state.entityId} onClick={() => onReset(state.entityId)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent)]">
                  Restore {action?.title ?? state.entityId}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Surface>
  );
}

function RequirementSections({ dashboard }: { dashboard: AuditDashboardViewModel }) {
  return (
    <div className="space-y-4">
      {(["attention", "in_progress", "remaining", "complete"] as DashboardRequirementStatus[]).map((status) => {
        const items = dashboard.sections[status];
        if (items.length === 0) return null;
        return <RequirementSection key={status} status={status} items={items} />;
      })}
    </div>
  );
}

function RequirementSection({ status, items }: { status: DashboardRequirementStatus; items: DashboardRequirement[] }) {
  const copy = sectionCopy[status];
  const initiallyOpen = status !== "complete";
  return (
    <details open={initiallyOpen} className={`rounded-2xl border border-t-4 border-[var(--border)] ${sectionTopBar[status]} bg-[var(--surface)] shadow-[var(--shadow-card)]`}>
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">{copy.title}</h2>
            <p className="text-sm text-[var(--text-secondary)]">{copy.detail}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${sectionBadgeTone[status]}`}>{items.length}</span>
        </div>
      </summary>
      <div className="grid min-w-0 gap-3 border-t border-[var(--border)] p-3 sm:p-4 lg:grid-cols-2">
        {items.map((item) => <RequirementCard key={item.id} item={item} />)}
      </div>
    </details>
  );
}

function RequirementCard({ item }: { item: DashboardRequirement }) {
  return (
    <article className={`min-w-0 rounded-2xl border border-[var(--border)] p-3 sm:p-4 ${
      item.status === "attention" ? "bg-rose-50/40" :
      item.status === "complete"  ? "bg-green-50/30" :
      "bg-[var(--surface-subtle)]"
    }`}>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-[var(--text-muted)]">{item.category}</p>
          <h3 className="mt-1 break-words text-sm font-semibold text-[var(--text-primary)]">{item.name}</h3>
        </div>
        <span className="text-xs font-semibold text-[var(--text-secondary)] sm:shrink-0">{item.progressLabel}</span>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--progress-track)]">
        {item.percent > 0 && (
          <div className={`h-full rounded-full ${progressTone[item.status]}`} style={{ width: `${Math.max(item.percent, 5)}%` }} />
        )}
      </div>
      {item.percent === 0 && <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Not started</p>}
      <p className="mt-3 break-words text-sm leading-6 text-[var(--text-secondary)]">{item.helperText}</p>
      {item.sampleCourses.length > 0 && (
        <p className="mt-3 break-words text-xs text-[var(--text-muted)]">Examples: {item.sampleCourses.join(", ")}</p>
      )}
      {item.warnings.length > 0 && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{item.warnings[0]}</p>
      )}
    </article>
  );
}
