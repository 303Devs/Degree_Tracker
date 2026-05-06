"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { RequirementGroup, Course } from "@/lib/types";
import { calcProgress, GRADE_SCALE } from "@/lib/prereqs";
import { computeProgressSemantics, type CourseCountingSummary } from "@/lib/progress";

function gradeColor(grade: string): string {
  const pts: Record<string, number> = {
    A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7,
    "C+": 2.3, C: 2.0, "C-": 1.7, "D+": 1.3, D: 1.0, "D-": 0.7, F: 0.0,
  };
  const p = pts[grade] ?? -1;
  if (p >= 3.7) return "text-green-400";
  if (p >= 2.7) return "text-indigo-400";
  if (p >= 1.7) return "text-yellow-400";
  if (p >= 0) return "text-red-400";
  return "text-[#6a6a8a]";
}

function typeLabel(group: RequirementGroup): string {
  switch (group.type) {
    case "complete_all": return "required";
    case "pick_one": return "pick one";
    case "pick_n": return `pick ${group.required ?? "N"}`;
    case "minimum_hours": return `>=\u2009${group.requiredHours ?? "?"} hrs`;
  }
}

function formatCourseId(id: string): string {
  return id.replaceAll("-", " ");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: "complete" | "in_progress" | "not_started" }) {
  const colors = {
    complete: "bg-green-500",
    in_progress: "bg-[#d4a843]",
    not_started: "bg-[#2a2a3a]",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]} shrink-0`} />;
}

function MiniProgressBar({ pct, ipFrac = 0 }: { pct: number; ipFrac?: number }) {
  const barColor =
    pct >= 1 ? "bg-green-500" : pct >= 0.66 ? "bg-[#d4a843]" : pct >= 0.33 ? "bg-indigo-500" : "bg-[#2a2a3a]";
  return (
    <div className="w-20 h-1 bg-[#1a1a2e] rounded-full overflow-hidden flex shrink-0">
      <div
        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
        style={{ width: `${Math.min(pct * 100, 100)}%` }}
      />
      {ipFrac > 0 && (
        <div className="h-full bg-[#d4a843]/30" style={{ width: `${Math.min(ipFrac * 100, 100 - pct * 100)}%` }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Elective picker for pick_n / pick_one groups
// ---------------------------------------------------------------------------

function ElectivePicker({
  group,
  courses,
  onUpdate,
}: {
  group: RequirementGroup;
  courses: Course[];
  onUpdate: (groupId: string, selected: string[]) => void;
}) {
  const selected = new Set(group.selectedCourses ?? []);
  const maxSelect = group.type === "pick_one" ? 1 : (group.required ?? Infinity);

  function toggle(courseId: string) {
    const next = new Set(selected);
    if (next.has(courseId)) {
      next.delete(courseId);
    } else {
      if (group.type === "pick_one") next.clear();
      if (next.size >= maxSelect) return;
      next.add(courseId);
    }
    onUpdate(group.id, Array.from(next));
  }

  const poolCourses = group.coursePool
    .map((id) => courses.find((c) => c.id === id))
    .filter((c): c is Course => !!c);
  const unknownIds = group.coursePool.filter((id) => !courses.find((c) => c.id === id));

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-[#6a6a8a]">
          {group.type === "pick_one"
            ? "Select one:"
            : `Select ${group.required ?? "N"} (${selected.size} chosen):`}
        </span>
        {selected.size > 0 && (
          <button
            onClick={() => onUpdate(group.id, [])}
            className="text-xs text-[#4a4a6a] hover:text-[#8888a8] transition-colors underline"
          >
            clear
          </button>
        )}
      </div>

      <div className="space-y-1">
        {poolCourses.map((c) => {
          const isSelected = selected.has(c.id);
          const isCompleted = c.status === "completed";
          const atLimit = !isSelected && selected.size >= maxSelect;

          return (
            <button
              key={c.id}
              onClick={() => !isCompleted && toggle(c.id)}
              disabled={atLimit && !isSelected}
              className={[
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-all",
                isSelected
                  ? "bg-[#d4a843]/10 border border-[#d4a843]/25"
                  : isCompleted
                  ? "bg-green-500/5 border border-green-500/10 cursor-default"
                  : atLimit
                  ? "opacity-40 cursor-not-allowed border border-transparent"
                  : "border border-transparent hover:bg-[#1a1a2e] hover:border-[#2a2a3e] cursor-pointer",
              ].join(" ")}
            >
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  isCompleted
                    ? "bg-green-500 border-green-500"
                    : isSelected
                    ? "bg-[#d4a843] border-[#d4a843]"
                    : "border-[#3a3a4a]"
                }`}
              >
                {(isSelected || isCompleted) && (
                  <svg className="w-2.5 h-2.5 text-[#0a0a12]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="font-mono text-xs text-indigo-300 w-20 shrink-0">{c.number}</span>
              <span className={`flex-1 truncate text-xs ${isSelected ? "text-[#d0d0e8]" : "text-[#8888a8]"}`}>
                {c.name}
              </span>
              <span className="text-[10px] text-[#4a4a6a] shrink-0">{c.credits}cr</span>
              {c.grade && (
                <span className={`text-xs font-mono ${gradeColor(c.grade)} shrink-0`}>{c.grade}</span>
              )}
              {isCompleted && <span className="text-[10px] text-green-400 shrink-0">done</span>}
              {c.prereqs && !isCompleted && (
                <span className="text-[9px] text-[#3a3a5a] shrink-0">prereqs</span>
              )}
            </button>
          );
        })}

        {unknownIds.map((id) => (
          <div key={id} className="flex items-center gap-3 px-3 py-2 opacity-30">
            <div className="w-4 h-4 rounded border border-[#3a3a4a]" />
            <span className="font-mono text-xs text-[#6a6a8a] w-20">{formatCourseId(id)}</span>
            <span className="text-xs text-[#4a4a6a] italic">not in system</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group row
// ---------------------------------------------------------------------------

function GroupRow({
  group,
  courses,
  onUpdate,
}: {
  group: RequirementGroup;
  courses: Course[];
  onUpdate: (groupId: string, selected: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const prog = calcProgress(group, courses);

  // Grade warnings: completed courses in this group that fall below minGrade
  const minGradeWarnings = group.minGrade
    ? group.coursePool
        .map((id) => courses.find((c) => c.id === id))
        .filter((c): c is Course => !!(c && c.status === "completed" && c.grade))
        .filter((c) => {
          const earned = GRADE_SCALE[c.grade!] ?? -1;
          const min = GRADE_SCALE[group.minGrade!] ?? -1;
          return earned >= 0 && min >= 0 && earned < min;
        })
    : [];
  const done = prog.pct >= 1.0;
  const ip = !done && prog.inProgress > 0;
  const status = done ? "complete" : ip ? "in_progress" : "not_started";
  const isPickGroup = group.type === "pick_n" || group.type === "pick_one";

  const poolCourses = group.coursePool
    .map((id) => courses.find((c) => c.id === id))
    .filter((c): c is Course => !!c);
  const unknownIds = group.coursePool.filter((id) => !courses.find((c) => c.id === id));

  return (
    <div className="border-b border-[#1a1a2e] last:border-0">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <StatusDot status={status} />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-[#d0d0e8]">{group.name}</span>
          {group.notes && (
            <span className="ml-2 text-xs text-[#4a4a6a]">{group.notes}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {minGradeWarnings.length > 0 && (
            <span title={`${minGradeWarnings.map((c) => c.number).join(", ")} below min grade ${group.minGrade}`}
              className="text-[9px] px-1.5 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/20 rounded uppercase tracking-wider">
              grade warn
            </span>
          )}
          <MiniProgressBar pct={prog.pct} ipFrac={prog.total > 0 ? prog.inProgress / prog.total : 0} />
          <span className="text-xs text-[#6a6a8a] w-16 text-right">{typeLabel(group)}</span>
          <span className={`text-xs font-mono tabular-nums w-14 text-right ${done ? "text-green-400" : ip ? "text-[#d4a843]" : "text-[#6a6a8a]"}`}>
            {prog.completed}/{prog.total}
            {prog.inProgress > 0 && <span className="text-[#d4a843]"> +{prog.inProgress}</span>}
          </span>
          {isPickGroup && (
            <span className="text-[9px] px-1.5 py-0.5 bg-[#d4a843]/10 text-[#d4a843] border border-[#d4a843]/20 rounded uppercase tracking-wider">
              pick
            </span>
          )}
          <svg
            className={`w-3.5 h-3.5 text-[#4a4a6a] transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="bg-[#0e0e1c]/60 border-t border-[#1a1a2e]">
          {isPickGroup ? (
            <ElectivePicker group={group} courses={courses} onUpdate={onUpdate} />
          ) : (
            <div className="px-4 py-3 space-y-1">
              {poolCourses.map((c) => {
                const cs =
                  c.status === "completed" ? "complete"
                  : c.status === "in_progress" ? "in_progress"
                  : "not_started";
                return (
                  <div key={c.id} className="flex items-center gap-3 py-1.5 text-sm">
                    <StatusDot status={cs} />
                    <span className="font-mono text-indigo-300 w-24 shrink-0 text-xs">{c.number}</span>
                    <span className="text-[#8888a8] flex-1 truncate text-xs">{c.name}</span>
                    <span className="text-[10px] text-[#4a4a6a]">{c.credits}cr</span>
                    {c.grade && (
                      <span className={`text-xs font-mono ${gradeColor(c.grade)}`}>{c.grade}</span>
                    )}
                    {c.semester && (
                      <span className="text-[10px] text-[#4a4a6a] font-mono">{c.semester}</span>
                    )}
                  </div>
                );
              })}
              {unknownIds.map((id) => (
                <div key={id} className="flex items-center gap-3 py-1.5">
                  <StatusDot status="not_started" />
                  <span className="font-mono text-[#4a4a6a] w-24 text-xs">{formatCourseId(id)}</span>
                  <span className="text-[10px] text-[#3a3a5a] italic">not in system</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function RequirementsWorkspace({ embedded = false }: { embedded?: boolean } = {}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [requirements, setRequirements] = useState<RequirementGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"needs_action" | "all" | "pick" | "complete">("needs_action");

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/courses").then((r) => r.json()),
      fetch("/api/requirements").then((r) => r.json()),
    ]).then(([c, r]) => {
      setCourses(Array.isArray(c) ? c : []);
      setRequirements(Array.isArray(r) ? r : []);
      setLoading(false);
    }).catch((err) => { setError(String(err)); setLoading(false); });
  }, []);

  const semanticsMap = useMemo(() => {
    const sem = computeProgressSemantics(courses, requirements);
    return new Map(sem.courses.map((s) => [s.courseId, s]));
  }, [courses, requirements]);

  const handleUpdateSelected = useCallback(async (groupId: string, selectedCourses: string[]) => {
    setRequirements((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, selectedCourses } : g))
    );
    setSaving(true);
    try {
      await fetch(`/api/requirements/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedCourses }),
      });
    } catch {
      const r = await fetch("/api/requirements").then((x) => x.json());
      setRequirements(Array.isArray(r) ? r : []);
    } finally {
      setSaving(false);
    }
  }, []);

  if (loading) {
    return <div className={`flex items-center justify-center ${embedded ? "min-h-40" : "min-h-screen"} text-[#6a6a8a]`}>Loading...</div>;
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center ${embedded ? "min-h-40" : "min-h-screen"} text-red-400 text-sm p-8`}>
        Failed to load requirements: {error}
      </div>
    );
  }

  if (requirements.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center ${embedded ? "min-h-40" : "min-h-screen"} gap-4 p-8 text-center`}>
        <p className="text-[#6a6a8a]">No requirements loaded yet.</p>
        <a href="/upload" className="text-[#d4a843] hover:text-[#e8c068] text-sm">Upload an audit PDF &rarr;</a>
      </div>
    );
  }

  const requirementStats = requirements.reduce(
    (acc, group) => {
      const progress = calcProgress(group, courses);
      if (progress.pct >= 1) acc.complete++;
      else acc.needsAction++;
      if (group.type === "pick_n" || group.type === "pick_one") acc.pick++;
      return acc;
    },
    { complete: 0, needsAction: 0, pick: 0 }
  );

  const visibleRequirements = requirements.filter((group) => {
    const progress = calcProgress(group, courses);
    const done = progress.pct >= 1;
    if (filter === "all") return true;
    if (filter === "complete") return done;
    if (filter === "pick") return group.type === "pick_n" || group.type === "pick_one";
    return !done;
  });

  const byCategory = new Map<string, RequirementGroup[]>();
  for (const g of visibleRequirements) {
    const list = byCategory.get(g.category) ?? [];
    list.push(g);
    byCategory.set(g.category, list);
  }

  return (
    <div className={`${embedded ? "space-y-4" : "p-8 max-w-5xl space-y-5"}`}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#d0d0e8]">Requirements</h2>
            <p className="text-[#6a6a8a] text-sm mt-1">
              Track unmet groups first, then open a row when you need course-level detail.
            </p>
          </div>
          {saving && <span className="text-xs text-[#d4a843] animate-pulse">Saving...</span>}
        </div>
      )}
      {embedded && saving && <span className="text-xs text-[#d4a843] animate-pulse">Saving...</span>}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#1e1e34] bg-[#111120] p-3">
        {([
          ["needs_action", `Needs action ${requirementStats.needsAction}`],
          ["pick", `Pick groups ${requirementStats.pick}`],
          ["complete", `Complete ${requirementStats.complete}`],
          ["all", `All ${requirements.length}`],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              filter === value
                ? "border-[#d4a843]/35 bg-[#d4a843]/12 text-[#d4a843]"
                : "border-[#2a2a3e] bg-[#0d0d1a] text-[#8888a8] hover:text-[#d0d0e8]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {Array.from(byCategory.entries()).map(([category, groups]) => {
        const categoryDone = groups.every((g) => calcProgress(g, courses).pct >= 1.0);
        const categoryIP = !categoryDone && groups.some((g) => calcProgress(g, courses).inProgress > 0);

        return (
          <section key={category} className="bg-[#111120] border border-[#1e1e34] rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e1e34] bg-[#0e0e1c]">
              <StatusDot status={categoryDone ? "complete" : categoryIP ? "in_progress" : "not_started"} />
              <h3 className="font-semibold text-[#d0d0e8] text-sm">{category}</h3>
              <div className="ml-auto text-xs text-[#4a4a6a]">
                {groups.filter((g) => calcProgress(g, courses).pct >= 1.0).length}/{groups.length} done
              </div>
            </div>
            <div>
              {groups.map((group) => (
                <GroupRow key={group.id} group={group} courses={courses} onUpdate={handleUpdateSelected} />
              ))}
            </div>
          </section>
        );
      })}
      {visibleRequirements.length === 0 && (
        <div className="rounded-xl border border-[#1e1e34] bg-[#111120] p-8 text-center text-sm text-[#6a6a8a]">
          No requirements match this filter.
        </div>
      )}
    </div>
  );
}
