"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildAuditDashboardViewModel,
  type AuditDashboardViewModel,
  type DashboardRequirement,
  type DashboardRequirementStatus,
} from "@/lib/audit-dashboard-view";
import type { Course, RequirementGroup, Semester } from "@/lib/types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; courses: Course[]; requirements: RequirementGroup[]; semesters: Semester[] };

const sectionCopy: Record<DashboardRequirementStatus, { title: string; detail: string }> = {
  attention: { title: "Needs attention", detail: "Review these before relying on your plan." },
  in_progress: { title: "In progress or planned", detail: "These are already moving; confirm they still fit." },
  remaining: { title: "Still remaining", detail: "Pick from these areas when choosing future courses." },
  complete: { title: "Complete", detail: "Finished areas are quieter by default." },
};

const statusTone: Record<DashboardRequirementStatus, string> = {
  attention: "bg-rose-500",
  in_progress: "bg-amber-500",
  remaining: "bg-slate-400",
  complete: "bg-green-600",
};

const progressTone: Record<DashboardRequirementStatus, string> = {
  attention: "bg-rose-500",
  in_progress: "bg-amber-500",
  remaining: "bg-[var(--text-muted)]",
  complete: "bg-green-600",
};

const nextActionLabels = ["Review first", "Confirm timing", "Choose next course"];

export default function AuditDashboard() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    Promise.all([
      fetch("/api/courses").then((response) => response.json()),
      fetch("/api/requirements").then((response) => response.json()),
      fetch("/api/semesters").then((response) => response.json()),
    ])
      .then(([courseData, requirementData, semesterData]) => {
        setState({
          status: "ready",
          courses: Array.isArray(courseData) ? courseData : [],
          requirements: Array.isArray(requirementData) ? requirementData : [],
          semesters: Array.isArray(semesterData) ? semesterData : [],
        });
      })
      .catch((error) => setState({ status: "error", message: String(error) }));
  }, []);

  if (state.status === "loading") {
    return <PageShell><Surface className="flex min-h-56 items-center justify-center text-[var(--text-muted)]">Loading audit dashboard...</Surface></PageShell>;
  }

  if (state.status === "error") {
    return <PageShell><Surface className="text-sm text-rose-600">Failed to load audit dashboard: {state.message}</Surface></PageShell>;
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

  return <DashboardContent courses={state.courses} requirements={state.requirements} semesters={state.semesters} />;
}

function DashboardContent({ courses, requirements, semesters }: { courses: Course[]; requirements: RequirementGroup[]; semesters: Semester[] }) {
  const dashboard = useMemo(() => buildAuditDashboardViewModel({ courses, requirements, semesters }), [courses, requirements, semesters]);

  return (
    <PageShell>
      <div className="space-y-5">
        <Hero dashboard={dashboard} />
        <NextActions dashboard={dashboard} />
        <RequirementSections dashboard={dashboard} />
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen w-full overflow-x-hidden bg-[var(--page-bg)] px-2 py-4 pb-8 text-[var(--text-primary)] sm:px-6 sm:py-5 lg:px-8"><div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-5">{children}</div></div>;
}

function Surface({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] ${className}`}>{children}</section>;
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

      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Metric label="requirements complete" value={`${summary.percentComplete}%`} detail={`${summary.completeRequirements} of ${summary.totalRequirements}`} emphasis />
        <Metric label="needs attention" value={String(summary.attentionRequirements)} detail="review first" />
        <Metric label="in progress" value={String(summary.inProgressRequirements)} detail={`${summary.creditsInProgress} credits active`} />
        <Metric label="planned credits" value={String(summary.creditsPlanned)} detail={`${summary.creditsCompleted} credits complete`} />
      </div>
    </Surface>
  );
}

function Metric({ label, value, detail, emphasis = false }: { label: string; value: string; detail: string; emphasis?: boolean }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-3 sm:p-4 ${emphasis ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
      <div className="break-words text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">{value}</div>
      <div className="mt-1 break-words text-[11px] font-medium text-[var(--text-secondary)] sm:text-xs">{label}</div>
      <div className="mt-2 break-words text-[11px] text-[var(--text-muted)] sm:text-xs">{detail}</div>
    </div>
  );
}

function NextActions({ dashboard }: { dashboard: AuditDashboardViewModel }) {
  return (
    <Surface className="min-w-0">
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">What to do next</h2>
          <p className="text-sm text-[var(--text-secondary)]">Based on where you stand right now.</p>
        </div>
      </div>
      <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-3">
        {dashboard.nextActions.map((action, index) => (
          <div key={action.id} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 sm:p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent)]"><span>{index + 1}</span><span>{nextActionLabels[index] ?? "Next action"}</span></div>
            <h3 className="mt-2 break-words text-sm font-semibold text-[var(--text-primary)]">{action.title}</h3>
            <p className="mt-2 break-words text-sm leading-6 text-[var(--text-secondary)]">{action.detail}</p>
          </div>
        ))}
      </div>
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
    <details open={initiallyOpen} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${statusTone[status]}`} />
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">{copy.title}</h2>
              <p className="text-sm text-[var(--text-secondary)]">{copy.detail}</p>
            </div>
          </div>
          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)]">{items.length}</span>
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
    <article className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 sm:p-4">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-[var(--text-muted)]">{item.category}</p>
          <h3 className="mt-1 break-words text-sm font-semibold text-[var(--text-primary)]">{item.name}</h3>
        </div>
        <span className="text-xs font-semibold text-[var(--text-secondary)] sm:shrink-0">{item.progressLabel}</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--progress-track)]">
        <div className={`h-full rounded-full ${progressTone[item.status]}`} style={{ width: `${item.percent}%` }} />
      </div>
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
