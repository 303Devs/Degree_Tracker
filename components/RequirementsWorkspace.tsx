"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Course, RequirementGroup, Semester } from "@/lib/types";
import { GRADE_SCALE } from "@/lib/prereqs";
import {
  buildAuditRequirementViewModels,
  type AuditCourseBucket,
  type AuditCourseOption,
  type AuditRequirementViewModel,
} from "@/lib/audit-plan-view";
import { applyCourseSemester, buildCourseSemesterPatch } from "@/lib/course-planning";

function gradeColor(grade: string): string {
  const pts = GRADE_SCALE[grade] ?? -1;
  if (pts >= 3.7) return "text-green-400";
  if (pts >= 2.7) return "text-indigo-400";
  if (pts >= 1.7) return "text-yellow-400";
  if (pts >= 0) return "text-red-400";
  return "text-slate-400";
}

function statusDotClass(bucket: AuditCourseBucket | "complete" | "in_progress" | "not_started"): string {
  if (bucket === "completed" || bucket === "complete") return "bg-green-500";
  if (bucket === "in_progress") return "bg-amber-400";
  if (bucket === "planned") return "bg-indigo-500";
  if (bucket === "unknown") return "bg-[#3a3a4a]";
  return "bg-[#2a2a3a]";
}

function StatusDot({ bucket }: { bucket: AuditCourseBucket | "complete" | "in_progress" | "not_started" }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass(bucket)}`} />;
}

const CATEGORY_THEMES = [
  "from-sky-50 to-blue-50 border-sky-100",
  "from-violet-50 to-fuchsia-50 border-violet-100",
  "from-emerald-50 to-teal-50 border-emerald-100",
  "from-amber-50 to-orange-50 border-amber-100",
  "from-rose-50 to-pink-50 border-rose-100",
  "from-indigo-50 to-slate-50 border-indigo-100",
];

function categoryTheme(name: string) {
  const seed = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return CATEGORY_THEMES[seed % CATEGORY_THEMES.length];
}

function MiniProgressBar({ pct, ipFrac = 0, plannedFrac = 0 }: { pct: number; ipFrac?: number; plannedFrac?: number }) {
  return (
    <div className="hidden h-1 w-24 shrink-0 sm:flex overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${Math.min(pct * 100, 100)}%` }} />
      {ipFrac > 0 && <div className="h-full bg-amber-400/45" style={{ width: `${Math.min(ipFrac * 100, 100)}%` }} />}
      {plannedFrac > 0 && <div className="h-full bg-indigo-500/35" style={{ width: `${Math.min(plannedFrac * 100, 100)}%` }} />}
    </div>
  );
}

function BucketPill({ label, count, bucket }: { label: string; count: number; bucket: AuditCourseBucket }) {
  const tone: Record<AuditCourseBucket, string> = {
    completed: "border-green-500/20 bg-green-500/10 text-green-400",
    in_progress: "border-amber-400/20 bg-amber-400/10 text-amber-600",
    planned: "border-indigo-500/20 bg-indigo-500/10 text-sky-700",
    remaining: "border-[#2a2a3a] bg-[#17172a] text-slate-500",
    unknown: "border-[#3a3a4a] bg-[#202032] text-slate-400",
  };
  return <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${tone[bucket]}`}>{label} {count}</span>;
}

function CourseStatusPill({ option }: { option: AuditCourseOption }) {
  if (option.warning?.severity === "warning") {
    return <span title={option.warning.message} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">Blocked</span>;
  }

  const labels: Record<AuditCourseBucket, string> = {
    completed: "Completed",
    in_progress: "In progress",
    planned: "Planned",
    remaining: "Remaining",
    unknown: "Missing",
  };
  const tone: Record<AuditCourseBucket, string> = {
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    in_progress: "border-amber-200 bg-amber-50 text-amber-700",
    planned: "border-sky-200 bg-sky-50 text-sky-700",
    remaining: "border-slate-200 bg-slate-50 text-slate-600",
    unknown: "border-slate-200 bg-slate-100 text-slate-500",
  };

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone[option.bucket]}`}>{labels[option.bucket]}</span>;
}

function CourseOptionRow({
  option,
  group,
  semesters,
  onToggle,
  onSemesterChange,
}: {
  option: AuditCourseOption;
  group: RequirementGroup;
  semesters: Semester[];
  onToggle?: (courseId: string) => void;
  onSemesterChange?: (courseId: string, semesterId: string | null) => void;
}) {
  const isPick = group.type === "pick_one" || group.type === "pick_n";
  const isSelected = option.selectionState === "selected";
  const canPlan =
    !!option.course &&
    option.status !== "completed" &&
    option.status !== "in_progress" &&
    option.status !== "registered";
  const plannedSemesters = semesters.filter((semester) => semester.status !== "completed");

  return (
    <div className={`flex w-full flex-col gap-3 rounded-2xl border px-3 py-3 text-left transition-colors sm:flex-row sm:items-center ${isSelected ? "border-amber-200 bg-amber-50/70" : "border-slate-100 bg-white hover:border-sky-200 hover:bg-sky-50/50"}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {isPick && (
          <button
            type="button"
            disabled={!option.course}
            onClick={() => option.course && onToggle?.(option.courseId)}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${isSelected ? "border-amber-400 bg-amber-400" : "border-slate-300 bg-white hover:border-amber-300"} disabled:cursor-not-allowed disabled:opacity-40`}
            aria-label={`${isSelected ? "Clear" : "Select"} ${option.courseNumber} for ${group.name}`}
          >
            {isSelected && <span className="text-[11px] font-bold text-white">✓</span>}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-semibold text-sky-700">{option.courseNumber}</span>
            <span className="min-w-0 text-sm font-medium leading-5 text-slate-800">{option.courseName}</span>
            <span className="text-xs text-slate-400">{option.credits} credits</span>
          </div>
          {option.grade && <div className={`mt-1 font-mono text-xs ${gradeColor(option.grade)}`}>Grade: {option.grade}</div>}
          {option.warning?.severity === "warning" && <div className="mt-1 text-xs text-amber-700">{option.warning.message}</div>}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        <CourseStatusPill option={option} />
        <select
          value={option.semester ?? ""}
          disabled={!canPlan || plannedSemesters.length === 0}
          onChange={(event) => {
            if (!canPlan || !option.course) return;
            onSemesterChange?.(option.course.id, event.target.value || null);
          }}
          className="max-w-[9rem] rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs text-slate-500 focus:border-sky-300 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          aria-label={`Plan ${option.courseNumber} semester`}
        >
          <option value="">Plan term</option>
          {plannedSemesters.map((semester) => (
            <option key={semester.id} value={semester.id}>{semester.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function BucketSection({
  title,
  bucket,
  options,
  group,
  semesters,
  onToggle,
  onSemesterChange,
}: {
  title: string;
  bucket: AuditCourseBucket;
  options: AuditCourseOption[];
  group: RequirementGroup;
  semesters: Semester[];
  onToggle?: (courseId: string) => void;
  onSemesterChange?: (courseId: string, semesterId: string | null) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium text-slate-500">
        <StatusDot bucket={bucket} /> {title}
      </div>
      <div className="space-y-1">
        {options.map((option) => (
          <CourseOptionRow
            key={option.courseId}
            option={option}
            group={group}
            semesters={semesters}
            onToggle={onToggle}
            onSemesterChange={onSemesterChange}
          />
        ))}
      </div>
    </div>
  );
}

function GroupRow({
  view,
  semesters,
  onUpdate,
  onSemesterChange,
}: {
  view: AuditRequirementViewModel;
  semesters: Semester[];
  onUpdate: (groupId: string, selected: string[]) => void;
  onSemesterChange?: (courseId: string, semesterId: string | null) => void;
}) {
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
    <div className="border-b border-slate-100 last:border-0">
      <button className="w-full px-5 py-4 text-left transition-colors hover:bg-sky-50/60" onClick={() => setOpen((value) => !value)}>
        <div className="flex items-center gap-3">
          <StatusDot bucket={done ? "complete" : active ? "in_progress" : "not_started"} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-medium text-slate-950">{group.name}</span>
              {isPick && <span className="rounded border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-600">pick</span>}
              {warningCount > 0 && <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">{warningCount} warning{warningCount === 1 ? "" : "s"}</span>}
              {minGradeWarnings.length > 0 && <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">grade warn</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
              <span>{view.displayRule}</span>
              {group.notes && <span>• {group.notes}</span>}
            </div>
          </div>

          <MiniProgressBar
            pct={progress.pct}
            ipFrac={progress.total > 0 ? progress.inProgress / progress.total : 0}
            plannedFrac={progress.total > 0 ? (progress.unit === "hours" ? counts.plannedCredits : counts.planned) / progress.total : 0}
          />
          <span className={`hidden w-24 text-right font-mono text-xs tabular-nums sm:block ${done ? "text-green-400" : active ? "text-amber-600" : "text-slate-400"}`}>
            {progress.completed}/{progress.total} {progress.unit === "hours" ? "hrs" : ""}
          </span>
          <svg className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </div>

      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="text-xs text-slate-500">{view.remainingLabel}</span>
            {isPick && group.selectedCourses?.length ? (
              <button onClick={() => onUpdate(group.id, [])} className="text-xs text-slate-400 underline transition-colors hover:text-slate-900">clear choices</button>
            ) : null}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <BucketSection title="Completed" bucket="completed" options={view.buckets.completed} group={group} semesters={semesters} onToggle={togglePick} onSemesterChange={onSemesterChange} />
            <BucketSection title="In progress" bucket="in_progress" options={view.buckets.in_progress} group={group} semesters={semesters} onToggle={togglePick} onSemesterChange={onSemesterChange} />
            <BucketSection title="Planned" bucket="planned" options={view.buckets.planned} group={group} semesters={semesters} onToggle={togglePick} onSemesterChange={onSemesterChange} />
            <BucketSection title="Options" bucket="remaining" options={view.buckets.remaining} group={group} semesters={semesters} onToggle={togglePick} onSemesterChange={onSemesterChange} />
            <BucketSection title="Missing from library" bucket="unknown" options={view.buckets.unknown} group={group} semesters={semesters} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function RequirementsWorkspace({
  embedded = false,
  onCoursesChanged,
}: {
  embedded?: boolean;
  onCoursesChanged?: () => void;
} = {}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [requirements, setRequirements] = useState<RequirementGroup[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"needs_action" | "all" | "pick" | "complete">("needs_action");
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const coursesRef = useRef<Course[]>([]);

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

  useEffect(() => {
    coursesRef.current = courses;
  }, [courses]);

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

  const handleUpdateCourseSemester = useCallback(async (courseId: string, semesterId: string | null) => {
    const current = coursesRef.current.find((course) => course.id === courseId);
    if (!current) {
      setMutationError("Could not plan that course because it is missing from the course library.");
      return;
    }

    setMutationError(null);
    setCourses((prev) => prev.map((course) => (course.id === courseId ? applyCourseSemester(course, semesterId) : course)));
    setSaving(true);

    try {
      const response = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCourseSemesterPatch(current, semesterId)),
      });
      if (!response.ok) throw new Error(`PATCH failed with ${response.status}`);

      const updatedCourse = (await response.json()) as Course;
      setCourses((prev) => prev.map((course) => (course.id === courseId ? updatedCourse : course)));
      onCoursesChanged?.();
    } catch (err) {
      setMutationError(`Could not update planned semester for ${current.number}: ${err instanceof Error ? err.message : String(err)}`);
      try {
        const latest = await fetch("/api/courses").then((response) => response.json());
        setCourses(Array.isArray(latest) ? latest : coursesRef.current);
      } catch {
        setCourses((prev) => prev.map((course) => (course.id === courseId ? current : course)));
      }
    } finally {
      setSaving(false);
    }
  }, [onCoursesChanged]);

  if (loading) return <div className={`flex items-center justify-center ${embedded ? "min-h-40" : "min-h-screen"} text-slate-400`}>Loading...</div>;
  if (error) return <div className={`flex items-center justify-center ${embedded ? "min-h-40" : "min-h-screen"} p-8 text-sm text-red-400`}>Failed to load requirements: {error}</div>;
  if (requirements.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center ${embedded ? "min-h-40" : "min-h-screen"} gap-4 p-8 text-center`}>
        <p className="text-slate-400">No requirements loaded yet.</p>
        <a href="/upload" className="text-sm text-amber-600 hover:text-[#e8c068]">Upload an audit PDF &rarr;</a>
      </div>
    );
  }

  const stats = views.reduce((acc, view) => {
    if (view.progress.pct >= 1) acc.complete++;
    else acc.needsAction++;
    if (view.group.type === "pick_n" || view.group.type === "pick_one") acc.pick++;
    acc.planned += view.counts.planned;
    acc.warnings += view.courseOptions.filter((option) => option.warning?.severity === "warning").length;
    return acc;
  }, { complete: 0, needsAction: 0, pick: 0, planned: 0, warnings: 0 });
  const completionPct = views.length ? Math.round((stats.complete / views.length) * 100) : 0;

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

  const categorySummaries = Array.from(byCategory.entries()).map(([category, categoryViews]) => ({
    category,
    total: categoryViews.length,
    complete: categoryViews.filter((view) => view.progress.pct >= 1).length,
    active: categoryViews.some((view) => view.progress.pct < 1 && (view.counts.inProgress > 0 || view.counts.planned > 0)),
  }));

  return (
    <div className={embedded ? "space-y-5" : "max-w-none space-y-5 p-8"}>
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Progress", `${completionPct}%`, "complete", "from-sky-500 to-blue-500"],
          ["Done", `${stats.complete}`, "requirements", "from-emerald-500 to-teal-500"],
          ["Remaining", `${stats.needsAction}`, "to finish", "from-amber-400 to-orange-500"],
          ["Planned", `${stats.planned}`, "courses", "from-violet-500 to-fuchsia-500"],
        ].map(([label, value, detail, gradient]) => (
          <div key={label} className={`rounded-3xl bg-gradient-to-br ${gradient} p-4 text-white shadow-lg shadow-slate-200/70`}>
            <div className="text-sm font-medium text-white/85">{label}</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
            <div className="mt-1 text-xs text-white/80">{detail}</div>
          </div>
        ))}
      </div>
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Audit Plan</h2>
            <p className="mt-1 text-sm text-slate-400">Choose courses and plan semesters from each card.</p>
          </div>
          {saving && <span className="animate-pulse text-xs text-amber-600">Saving...</span>}
        </div>
      )}
      {embedded && saving && <span className="animate-pulse text-xs text-amber-600">Saving...</span>}
      {mutationError && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {mutationError}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-3xl border border-white bg-white/90 p-3 shadow-lg shadow-sky-100/60">
            <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Show</div>
            <div className="flex flex-wrap gap-2 lg:flex-col">
              {([
                ["needs_action", `Remaining ${stats.needsAction}`],
                ["pick", `Choices ${stats.pick}`],
                ["complete", `Done ${stats.complete}`],
                ["all", `All ${requirements.length}`],
              ] as const).map(([value, label]) => (
                <button key={value} onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1.5 text-left text-xs transition-colors ${filter === value ? "border-amber-400/35 bg-amber-400/12 text-amber-600" : "border-slate-200 bg-white text-slate-500 hover:text-slate-900"}`}>{label}</button>
              ))}
            </div>
          </div>

          {categorySummaries.length > 0 && (
            <div className="hidden rounded-3xl border border-white bg-white/90 p-3 shadow-lg shadow-sky-100/60 lg:block">
              <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Areas</div>
              <div className="space-y-1.5">
                {categorySummaries.map(({ category, complete, total, active }) => (
                  <div key={category} className={`rounded-2xl border bg-gradient-to-br px-2.5 py-2 ${categoryTheme(category)}`}>
                    <div className="flex items-start gap-2">
                      <StatusDot bucket={complete === total ? "complete" : active ? "in_progress" : "not_started"} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-slate-900" title={category}>{category}</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">{complete}/{total} done</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-3">
          {Array.from(byCategory.entries()).map(([category, categoryViews]) => {
            const categoryDone = categoryViews.every((view) => view.progress.pct >= 1);
            const categoryActive = !categoryDone && categoryViews.some((view) => view.counts.inProgress > 0 || view.counts.planned > 0);
            return (
              <section key={category} className="overflow-hidden rounded-3xl border border-white bg-white/95 shadow-lg shadow-sky-100/60">
                <div className={`flex items-center gap-3 border-b bg-gradient-to-r px-5 py-3 ${categoryTheme(category)}`}>
                  <StatusDot bucket={categoryDone ? "complete" : categoryActive ? "in_progress" : "not_started"} />
                  <h3 className="text-sm font-semibold text-slate-900">{category}</h3>
                  <div className="ml-auto rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-600">{categoryViews.filter((view) => view.progress.pct >= 1).length}/{categoryViews.length} done</div>
                </div>
                <div>{categoryViews.map((view) => (
                  <GroupRow
                    key={view.group.id}
                    view={view}
                    semesters={semesters}
                    onUpdate={handleUpdateSelected}
                    onSemesterChange={handleUpdateCourseSemester}
                  />
                ))}</div>
              </section>
            );
          })}
          {visibleViews.length === 0 && <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">No requirements match this filter.</div>}
        </div>
      </div>
    </div>
  );
}
