"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Course, RequirementGroup, Semester } from "@/lib/types";
import { GRADE_SCALE } from "@/lib/prereqs";
import {
  buildAuditRequirementViewModels,
  type AuditCourseBucket,
  type AuditCourseOption,
  type AuditRequirementViewModel,
} from "@/lib/audit-plan-view";

function gradeColor(grade: string): string {
  const pts = GRADE_SCALE[grade] ?? -1;
  if (pts >= 3.7) return "text-green-400";
  if (pts >= 2.7) return "text-indigo-400";
  if (pts >= 1.7) return "text-yellow-400";
  if (pts >= 0) return "text-red-400";
  return "text-[#6a6a8a]";
}

function statusDotClass(bucket: AuditCourseBucket | "complete" | "in_progress" | "not_started"): string {
  if (bucket === "completed" || bucket === "complete") return "bg-green-500";
  if (bucket === "in_progress") return "bg-[#d4a843]";
  if (bucket === "planned") return "bg-indigo-500";
  if (bucket === "unknown") return "bg-[#3a3a4a]";
  return "bg-[#2a2a3a]";
}

function StatusDot({ bucket }: { bucket: AuditCourseBucket | "complete" | "in_progress" | "not_started" }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass(bucket)}`} />;
}

function MiniProgressBar({ pct, ipFrac = 0, plannedFrac = 0 }: { pct: number; ipFrac?: number; plannedFrac?: number }) {
  return (
    <div className="flex h-1 w-24 shrink-0 overflow-hidden rounded-full bg-[#1a1a2e]">
      <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${Math.min(pct * 100, 100)}%` }} />
      {ipFrac > 0 && <div className="h-full bg-[#d4a843]/45" style={{ width: `${Math.min(ipFrac * 100, 100)}%` }} />}
      {plannedFrac > 0 && <div className="h-full bg-indigo-500/35" style={{ width: `${Math.min(plannedFrac * 100, 100)}%` }} />}
    </div>
  );
}

function BucketPill({ label, count, bucket }: { label: string; count: number; bucket: AuditCourseBucket }) {
  const tone: Record<AuditCourseBucket, string> = {
    completed: "border-green-500/20 bg-green-500/10 text-green-400",
    in_progress: "border-[#d4a843]/20 bg-[#d4a843]/10 text-[#d4a843]",
    planned: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
    remaining: "border-[#2a2a3a] bg-[#17172a] text-[#8888a8]",
    unknown: "border-[#3a3a4a] bg-[#202032] text-[#6a6a8a]",
  };
  return <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${tone[bucket]}`}>{label} {count}</span>;
}

function WarningBadge({ option }: { option: AuditCourseOption }) {
  if (!option.warning) return null;
  const tone =
    option.warning.severity === "warning"
      ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
      : option.warning.severity === "success"
        ? "border-green-500/20 bg-green-500/10 text-green-400"
        : "border-indigo-500/20 bg-indigo-500/10 text-indigo-300";
  return <span title={option.warning.message} className={`rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${tone}`}>{option.warning.severity === "warning" ? "warning" : option.warning.severity === "success" ? "ok" : "check"}</span>;
}

function CourseOptionRow({
  option,
  group,
  onToggle,
}: {
  option: AuditCourseOption;
  group: RequirementGroup;
  onToggle?: (courseId: string) => void;
}) {
  const isPick = group.type === "pick_one" || group.type === "pick_n";
  const isSelected = option.selectionState === "selected";
  const isCompleted = option.status === "completed";
  const content = (
    <>
      <StatusDot bucket={option.bucket} />
      {isPick && (
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSelected ? "border-[#d4a843] bg-[#d4a843]" : "border-[#3a3a4a]"}`}>
          {isSelected && <span className="text-[10px] font-bold text-[#0a0a12]">✓</span>}
        </span>
      )}
      <span className="w-24 shrink-0 font-mono text-xs text-indigo-300">{option.courseNumber}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-[#9090b0]">{option.courseName}</span>
      <span className="text-[10px] text-[#4a4a6a]">{option.credits}cr</span>
      {option.grade && <span className={`font-mono text-xs ${gradeColor(option.grade)}`}>{option.grade}</span>}
      {option.semester && <span className="font-mono text-[10px] text-[#6a6a8a]">{option.semester}</span>}
      {isPick && <span className="text-[9px] uppercase tracking-wider text-[#4a4a6a]">{isSelected ? "selected" : isCompleted ? "eligible done" : "eligible"}</span>}
      <WarningBadge option={option} />
    </>
  );

  if (isPick && onToggle && option.course) {
    return (
      <button
        onClick={() => onToggle(option.courseId)}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${isSelected ? "border-[#d4a843]/25 bg-[#d4a843]/10" : "border-transparent hover:border-[#2a2a3e] hover:bg-[#1a1a2e]"}`}
      >
        {content}
      </button>
    );
  }

  return <div className="flex items-center gap-3 rounded-lg px-3 py-2">{content}</div>;
}

function BucketSection({ title, bucket, options, group, onToggle }: { title: string; bucket: AuditCourseBucket; options: AuditCourseOption[]; group: RequirementGroup; onToggle?: (courseId: string) => void }) {
  if (options.length === 0) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 px-1 text-[10px] uppercase tracking-widest text-[#4a4a6a]">
        <StatusDot bucket={bucket} /> {title}
      </div>
      <div className="space-y-1">
        {options.map((option) => <CourseOptionRow key={option.courseId} option={option} group={group} onToggle={onToggle} />)}
      </div>
    </div>
  );
}

function GroupRow({ view, onUpdate }: { view: AuditRequirementViewModel; onUpdate: (groupId: string, selected: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const { group, progress, counts } = view;
  const done = progress.pct >= 1;
  const active = !done && (counts.inProgress > 0 || counts.planned > 0);
  const isPick = group.type === "pick_n" || group.type === "pick_one";
  const warningCount = view.courseOptions.filter((option) => option.warning?.severity === "warning").length;
  const minGradeWarnings = group.minGrade
    ? view.courseOptions.filter((option) => {
        if (option.status !== "completed" || !option.grade) return false;
        const earned = GRADE_SCALE[option.grade] ?? -1;
        const min = GRADE_SCALE[group.minGrade!] ?? -1;
        return earned >= 0 && min >= 0 && earned < min;
      })
    : [];

  const togglePick = (courseId: string) => {
    const selected = new Set(group.selectedCourses ?? []);
    if (selected.has(courseId)) selected.delete(courseId);
    else {
      if (group.type === "pick_one") selected.clear();
      const max = group.type === "pick_one" ? 1 : group.required ?? Infinity;
      if (selected.size >= max) return;
      selected.add(courseId);
    }
    onUpdate(group.id, Array.from(selected));
  };

  return (
    <div className="border-b border-[#1a1a2e] last:border-0">
      <button className="w-full px-4 py-3 text-left transition-colors hover:bg-white/3" onClick={() => setOpen((value) => !value)}>
        <div className="flex items-center gap-3">
          <StatusDot bucket={done ? "complete" : active ? "in_progress" : "not_started"} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-[#d0d0e8]">{group.name}</span>
              {isPick && <span className="rounded border border-[#d4a843]/20 bg-[#d4a843]/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[#d4a843]">pick</span>}
              {warningCount > 0 && <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">{warningCount} warning{warningCount === 1 ? "" : "s"}</span>}
              {minGradeWarnings.length > 0 && <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">grade warn</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[#6a6a8a]">
              <span>{view.displayRule}</span>
              {group.notes && <span>• {group.notes}</span>}
            </div>
          </div>
          <div className="hidden items-center gap-1 md:flex">
            <BucketPill label="done" count={counts.completed} bucket="completed" />
            <BucketPill label="IP" count={counts.inProgress} bucket="in_progress" />
            <BucketPill label="planned" count={counts.planned} bucket="planned" />
            <BucketPill label="remaining" count={counts.remaining} bucket="remaining" />
          </div>
          <MiniProgressBar
            pct={progress.pct}
            ipFrac={progress.total > 0 ? progress.inProgress / progress.total : 0}
            plannedFrac={progress.total > 0 ? (progress.unit === "hours" ? counts.plannedCredits : counts.planned) / progress.total : 0}
          />
          <span className={`w-24 text-right font-mono text-xs tabular-nums ${done ? "text-green-400" : active ? "text-[#d4a843]" : "text-[#6a6a8a]"}`}>
            {progress.completed}/{progress.total} {progress.unit === "hours" ? "hrs" : ""}
          </span>
          <svg className={`h-3.5 w-3.5 shrink-0 text-[#4a4a6a] transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1 md:hidden">
          <BucketPill label="done" count={counts.completed} bucket="completed" />
          <BucketPill label="IP" count={counts.inProgress} bucket="in_progress" />
          <BucketPill label="planned" count={counts.planned} bucket="planned" />
          <BucketPill label="remaining" count={counts.remaining} bucket="remaining" />
        </div>
      </button>

      {open && (
        <div className="border-t border-[#1a1a2e] bg-[#0e0e1c]/60 px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[#1e1e34] bg-[#111120] px-3 py-2">
            <span className="text-xs text-[#8888a8]">{view.remainingLabel}</span>
            {isPick && group.selectedCourses?.length ? (
              <button onClick={() => onUpdate(group.id, [])} className="text-xs text-[#6a6a8a] underline transition-colors hover:text-[#d0d0e8]">clear choices</button>
            ) : null}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <BucketSection title="Completed / eligible options" bucket="completed" options={view.buckets.completed} group={group} onToggle={togglePick} />
            <BucketSection title="In progress / registered" bucket="in_progress" options={view.buckets.in_progress} group={group} onToggle={togglePick} />
            <BucketSection title="Planned in a future term" bucket="planned" options={view.buckets.planned} group={group} onToggle={togglePick} />
            <BucketSection title="Remaining eligible options" bucket="remaining" options={view.buckets.remaining} group={group} onToggle={togglePick} />
            <BucketSection title="Referenced by audit, not in library" bucket="unknown" options={view.buckets.unknown} group={group} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function RequirementsWorkspace({ embedded = false }: { embedded?: boolean } = {}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [requirements, setRequirements] = useState<RequirementGroup[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"needs_action" | "all" | "pick" | "complete">("needs_action");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/courses").then((response) => response.json()),
      fetch("/api/requirements").then((response) => response.json()),
      fetch("/api/semesters").then((response) => response.json()),
    ])
      .then(([courseData, requirementData, semesterData]) => {
        setCourses(Array.isArray(courseData) ? courseData : []);
        setRequirements(Array.isArray(requirementData) ? requirementData : []);
        setSemesters(Array.isArray(semesterData) ? semesterData : []);
        setLoading(false);
      })
      .catch((err) => { setError(String(err)); setLoading(false); });
  }, []);

  const views = useMemo(() => buildAuditRequirementViewModels({ courses, requirements, semesters }), [courses, requirements, semesters]);

  const handleUpdateSelected = useCallback(async (groupId: string, selectedCourses: string[]) => {
    setRequirements((prev) => prev.map((group) => (group.id === groupId ? { ...group, selectedCourses } : group)));
    setSaving(true);
    try {
      await fetch(`/api/requirements/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedCourses }),
      });
    } catch {
      const latest = await fetch("/api/requirements").then((response) => response.json());
      setRequirements(Array.isArray(latest) ? latest : []);
    } finally {
      setSaving(false);
    }
  }, []);

  if (loading) return <div className={`flex items-center justify-center ${embedded ? "min-h-40" : "min-h-screen"} text-[#6a6a8a]`}>Loading...</div>;
  if (error) return <div className={`flex items-center justify-center ${embedded ? "min-h-40" : "min-h-screen"} p-8 text-sm text-red-400`}>Failed to load requirements: {error}</div>;
  if (requirements.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center ${embedded ? "min-h-40" : "min-h-screen"} gap-4 p-8 text-center`}>
        <p className="text-[#6a6a8a]">No requirements loaded yet.</p>
        <a href="/upload" className="text-sm text-[#d4a843] hover:text-[#e8c068]">Upload an audit PDF &rarr;</a>
      </div>
    );
  }

  const stats = views.reduce((acc, view) => {
    if (view.progress.pct >= 1) acc.complete++;
    else acc.needsAction++;
    if (view.group.type === "pick_n" || view.group.type === "pick_one") acc.pick++;
    return acc;
  }, { complete: 0, needsAction: 0, pick: 0 });

  const visibleViews = views.filter((view) => {
    const done = view.progress.pct >= 1;
    if (filter === "all") return true;
    if (filter === "complete") return done;
    if (filter === "pick") return view.group.type === "pick_n" || view.group.type === "pick_one";
    return !done;
  });

  const byCategory = new Map<string, AuditRequirementViewModel[]>();
  for (const view of visibleViews) {
    const list = byCategory.get(view.group.category) ?? [];
    list.push(view);
    byCategory.set(view.group.category, list);
  }

  return (
    <div className={embedded ? "space-y-4" : "max-w-6xl space-y-5 p-8"}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#d0d0e8]">Audit Plan</h2>
            <p className="mt-1 text-sm text-[#6a6a8a]">Requirement groups are the spine; planning context stays attached to each audit row.</p>
          </div>
          {saving && <span className="animate-pulse text-xs text-[#d4a843]">Saving...</span>}
        </div>
      )}
      {embedded && saving && <span className="animate-pulse text-xs text-[#d4a843]">Saving...</span>}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#1e1e34] bg-[#111120] p-3">
        {([
          ["needs_action", `Needs action ${stats.needsAction}`],
          ["pick", `Pick groups ${stats.pick}`],
          ["complete", `Complete ${stats.complete}`],
          ["all", `All ${requirements.length}`],
        ] as const).map(([value, label]) => (
          <button key={value} onClick={() => setFilter(value)} className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${filter === value ? "border-[#d4a843]/35 bg-[#d4a843]/12 text-[#d4a843]" : "border-[#2a2a3e] bg-[#0d0d1a] text-[#8888a8] hover:text-[#d0d0e8]"}`}>{label}</button>
        ))}
      </div>

      {Array.from(byCategory.entries()).map(([category, categoryViews]) => {
        const categoryDone = categoryViews.every((view) => view.progress.pct >= 1);
        const categoryActive = !categoryDone && categoryViews.some((view) => view.counts.inProgress > 0 || view.counts.planned > 0);
        return (
          <section key={category} className="overflow-hidden rounded-xl border border-[#1e1e34] bg-[#111120]">
            <div className="flex items-center gap-3 border-b border-[#1e1e34] bg-[#0e0e1c] px-4 py-3">
              <StatusDot bucket={categoryDone ? "complete" : categoryActive ? "in_progress" : "not_started"} />
              <h3 className="text-sm font-semibold text-[#d0d0e8]">{category}</h3>
              <div className="ml-auto text-xs text-[#4a4a6a]">{categoryViews.filter((view) => view.progress.pct >= 1).length}/{categoryViews.length} done</div>
            </div>
            <div>{categoryViews.map((view) => <GroupRow key={view.group.id} view={view} onUpdate={handleUpdateSelected} />)}</div>
          </section>
        );
      })}
      {visibleViews.length === 0 && <div className="rounded-xl border border-[#1e1e34] bg-[#111120] p-8 text-center text-sm text-[#6a6a8a]">No requirements match this filter.</div>}
    </div>
  );
}
