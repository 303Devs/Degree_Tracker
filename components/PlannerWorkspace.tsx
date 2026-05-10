"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Course, Semester, RequirementGroup } from "@/lib/types";
import {
  sortSemesters,
  validateDrop,
  getCascadeWarnings,
  isRuleSatisfied,
  NON_DEGREE_CREDIT_GRADES,
  type CascadeItem,
  type DropValidation,
} from "@/lib/prereqs";
import {
  validatePlan,
  type PlannerValidationSummary,
} from "@/lib/planner-validation";
import { buildCourseSemesterPatch } from "@/lib/course-planning";
import { buildAuditRequirementViewModels, type AuditRequirementViewModel } from "@/lib/audit-plan-view";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SemId = string; // semester id or "unplanned"

interface PrereqModal {
  course: Course;
  toSemLabel: string;
  validation: DropValidation;
}

interface CascadeModal {
  course: Course;
  fromSemLabel: string;
  toSemLabel: string;
  affected: CascadeItem[];
  onConfirm: () => void;
}

interface NewSemForm {
  type: "fall" | "spring" | "summer";
  year: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function semIdToLabel(semId: string, semesters: Semester[]): string {
  return semesters.find((s) => s.id === semId)?.label ?? semId;
}

function formatCourseId(id: string): string {
  return id.replaceAll("-", " ");
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

// ---------------------------------------------------------------------------
// Course card (draggable)
// ---------------------------------------------------------------------------

function PlannerCard({
  course,
  semId,
  allCourses,
  sortedSems,
  assignments,
  overlay = false,
}: {
  course: Course;
  semId: SemId;
  allCourses: Course[];
  sortedSems: Semester[];
  assignments: Map<string, string>;
  overlay?: boolean;
}) {
  const draggable = !overlay && course.status !== "completed" && course.status !== "in_progress" && course.status !== "registered";

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: course.id,
    disabled: !draggable,
    data: { semId },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  // Check prereq satisfaction in current planner state
  const prereqOk = useMemo(() => {
    if (!course.prereqs) return true;
    if (semId === "unplanned") return true;
    const targetIdx = sortedSems.findIndex((s) => s.id === semId);
    const available = new Set<string>();
    for (const c of allCourses) {
      if (c.id === course.id) continue;
      // W/NR/IP don't satisfy prereqs — no degree credit earned
      if (c.status === "completed" && !(c.grade && NON_DEGREE_CREDIT_GRADES.has(c.grade))) { available.add(c.id); continue; }
      const cSem = assignments.get(c.id) ?? "unplanned";
      if (cSem === "unplanned") continue;
      const cIdx = sortedSems.findIndex((s) => s.id === cSem);
      if (cIdx !== -1 && cIdx < targetIdx) available.add(c.id);
    }
    return isRuleSatisfied(course.prereqs, available);
  }, [course, semId, sortedSems, allCourses, assignments]);

  const statusDot: Record<string, string> = {
    completed: "bg-green-500",
    in_progress: "bg-[#d4a843]",
    registered: "bg-blue-400",
    planned: "bg-indigo-500",
    not_started: "bg-[#2a2a3a]",
  };

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      className={[
        "rounded-2xl border bg-white p-3 shadow-sm select-none transition-all duration-150",
        isDragging ? "opacity-30 scale-95" : "",
        overlay ? "rotate-1 scale-105 border-sky-300 shadow-2xl shadow-sky-200/70" : "",
        !overlay && draggable ? "cursor-grab active:cursor-grabbing hover:border-sky-300 hover:bg-sky-50" : "",
        !overlay && !draggable ? "cursor-default opacity-80" : "",
        !overlay && !isDragging ? "border-slate-200" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-sky-700">{course.number}</span>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">{course.name}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="text-[10px] text-slate-400">{course.credits}cr</span>
          <span className={`w-2 h-2 rounded-full ${statusDot[course.status] ?? "bg-[#2a2a3a]"}`} />
        </div>
      </div>
      {/* Prereq indicator */}
      {course.prereqs && semId !== "unplanned" && (
        <div className="mt-2 flex items-center gap-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${prereqOk ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className={`text-[9px] ${prereqOk ? "text-green-500/60" : "text-red-400"}`}>
            {prereqOk ? "prereqs ok" : "prereqs missing"}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Semester column (droppable)
// ---------------------------------------------------------------------------

function SemesterColumn({
  semester,
  courses,
  allCourses,
  sortedSems,
  assignments,
  onStatusChange,
}: {
  semester: Semester;
  courses: Course[];
  allCourses: Course[];
  sortedSems: Semester[];
  assignments: Map<string, string>;
  onStatusChange: (semesterId: string, status: Semester["status"]) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: semester.id });

  const totalCredits = courses.reduce((a, c) => a + c.credits, 0);
  const creditWarn = totalCredits > 18 || (totalCredits > 0 && totalCredits < 12 && (semester.status === "planned"));

  const headerBg: Record<string, string> = {
    completed: "border-green-200 bg-green-50",
    in_progress: "border-amber-200 bg-amber-50",
    registered: "border-blue-200 bg-blue-50",
    planned: "border-slate-200 bg-white",
  };

  const ringColor = isOver ? "ring-4 ring-sky-100 border-sky-300" : "";

  return (
    <div
      className={`flex min-w-0 flex-col rounded-3xl border bg-white shadow-sm transition-all duration-150 ${headerBg[semester.status] ?? "border-slate-200"} ${ringColor}`}
    >
      {/* Column header */}
      <div className={`px-3 py-2.5 border-b ${headerBg[semester.status] ?? "border-slate-200"}`}>
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold leading-none text-slate-900">{semester.label}</span>
          <select
            value={semester.status}
            onChange={(e) => onStatusChange(semester.id, e.target.value as Semester["status"])}
            className="max-w-[7.5rem] rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] text-slate-600 focus:border-sky-300 focus:outline-none"
            aria-label={`Set ${semester.label} status`}
          >
            <option value="completed">completed</option>
            <option value="in_progress">in progress</option>
            <option value="registered">registered</option>
            <option value="planned">planned</option>
          </select>
        </div>
        <div className={`text-[11px] mt-1 ${creditWarn ? "text-amber-400" : "text-slate-400"}`}>
          {totalCredits} credits{creditWarn ? (totalCredits > 18 ? " — overloaded" : " — underloaded") : ""}
        </div>
      </div>

      {/* Droppable body */}
      <div ref={setNodeRef} className="flex-1 p-2 space-y-2 min-h-[100px]">
        {courses.map((course) => (
          <PlannerCard
            key={course.id}
            course={course}
            semId={semester.id}
            allCourses={allCourses}
            sortedSems={sortedSems}
            assignments={assignments}
          />
        ))}
        {courses.length === 0 && (
          <div
            className={`h-16 rounded-lg border border-dashed flex items-center justify-center transition-colors ${
              isOver ? "border-sky-300 bg-sky-50" : "border-slate-200"
            }`}
          >
            <span className="text-[10px] text-slate-400">drop here</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unplanned pool (droppable)
// ---------------------------------------------------------------------------

function buildUnplannedRequirementGroups(views: AuditRequirementViewModel[], unplannedCourses: Course[]) {
  const unplannedById = new Map(unplannedCourses.map((course) => [course.id, course]));
  return views
    .filter((view) => view.progress.pct < 1)
    .map((view) => ({
      view,
      courses: view.courseOptions
        .filter((option) => option.course && unplannedById.has(option.course.id))
        .map((option) => ({ course: option.course!, warning: option.warning })),
    }))
    .filter((group) => group.courses.length > 0);
}

function UnplannedPool({
  courses,
  allCourses,
  sortedSems,
  assignments,
  requirementGroups,
  collapsed,
  onToggle,
}: {
  courses: Course[];
  allCourses: Course[];
  sortedSems: Semester[];
  assignments: Map<string, string>;
  requirementGroups: ReturnType<typeof buildUnplannedRequirementGroups>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: "unplanned" });

  return (
    <div className={`overflow-hidden rounded-3xl border bg-white shadow-sm transition-all ${isOver ? "border-sky-300 ring-4 ring-sky-100" : "border-slate-200"}`}>
      <button className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-slate-50" onClick={onToggle}>
        <div>
          <div className="text-base font-semibold text-slate-950">Courses to place</div>
          <div className="mt-1 text-sm text-slate-500">Grouped by the requirement they can help finish.</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700">{courses.length}</span>
          <svg className={`h-4 w-4 text-slate-400 transition-transform ${collapsed ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {!collapsed && (
        <div ref={setNodeRef} className="border-t border-slate-100 p-4">
          {courses.length === 0 ? (
            <div className={`flex h-20 items-center justify-center rounded-2xl border border-dashed ${isOver ? "border-sky-300 bg-sky-50" : "border-slate-200"}`}>
              <span className="text-sm text-slate-400">Everything is placed.</span>
            </div>
          ) : requirementGroups.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {requirementGroups.map(({ view, courses: groupCourses }) => (
                <section key={view.group.id} className={`rounded-3xl border bg-gradient-to-br p-3 ${categoryTheme(view.group.category)}`}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-slate-500">{view.group.category}</div>
                      <h3 className="mt-0.5 text-sm font-semibold text-slate-900">{view.group.name}</h3>
                    </div>
                    <span className="rounded-full bg-white/75 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm">{view.remainingLabel}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {groupCourses.map(({ course, warning }) => (
                      <div key={`${view.group.id}-${course.id}`} className="space-y-1">
                        <PlannerCard course={course} semId="unplanned" allCourses={allCourses} sortedSems={sortedSems} assignments={assignments} />
                        {warning && (
                          <div className={`px-1 text-[10px] ${warning.severity === "warning" ? "text-amber-600" : "text-slate-500"}`}>
                            {warning.message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {courses.map((course) => (
                <PlannerCard key={course.id} course={course} semId="unplanned" allCourses={allCourses} sortedSems={sortedSems} assignments={assignments} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

function SemesterBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-500/10 text-green-400 border-green-500/20",
    in_progress: "bg-[#d4a843]/10 text-[#d4a843] border-[#d4a843]/20",
    registered: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    planned: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  };
  const label: Record<string, string> = {
    in_progress: "in progress",
    registered: "registered",
    completed: "completed",
    planned: "planned",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] border uppercase tracking-wider ${styles[status] ?? ""}`}>
      {label[status] ?? status.replace("_", " ")}
    </span>
  );
}

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation panel
// ---------------------------------------------------------------------------

function ValidationPanel({
  validation,
  open,
  onToggle,
}: {
  validation: PlannerValidationSummary;
  open: boolean;
  onToggle: () => void;
}) {
  const issueCount =
    validation.prereqViolations.length +
    validation.coreqViolations.length +
    validation.termLoadIssues.length +
    validation.unplannedRequired.length;
  const unmetCount = validation.unmetRequirements.length;

  const statusColor = validation.clean
    ? "border-green-500/20 bg-green-500/5"
    : "border-amber-500/20 bg-amber-500/5";
  const statusIcon = validation.clean ? "✓" : "⚠";

  return (
    <div className={`rounded-xl border ${statusColor} overflow-hidden transition-all`}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors text-left"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className={`text-sm ${validation.clean ? "text-green-400" : "text-amber-400"}`}>
            {statusIcon}
          </span>
          <div>
            <span className="text-sm font-semibold text-slate-900">Plan Validation</span>
            <span className="text-xs text-slate-500 ml-2">
              {validation.clean
                ? "All clear"
                : `${issueCount} issue${issueCount !== 1 ? "s" : ""}${unmetCount > 0 ? `, ${unmetCount} unmet req${unmetCount !== 1 ? "s" : ""}` : ""}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {validation.projectedCompletionTerm && (
            <span className="text-[10px] text-slate-500">
              Est. completion: <span className="text-[#d4a843]">{validation.projectedCompletionTerm.semesterLabel}</span>
            </span>
          )}
          <svg
            className={`w-4 h-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-200 p-4 space-y-4">
          {/* Prereq violations */}
          {validation.prereqViolations.length > 0 && (
            <div>
              <h4 className="text-xs text-red-400 uppercase tracking-wide mb-2 font-medium">Prerequisite Violations</h4>
              <div className="space-y-1">
                {validation.prereqViolations.map((v) => (
                  <div key={v.courseId} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    <span className="font-mono text-indigo-300 text-xs">{v.courseNumber}</span>
                    <span className="text-slate-500 text-xs">in {v.semesterLabel} — missing:</span>
                    <span className="text-xs text-red-300 font-mono">
                      {v.missing.map((id) => id.replace("-", " ")).join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coreq violations */}
          {validation.coreqViolations.length > 0 && (
            <div>
              <h4 className="text-xs text-amber-400 uppercase tracking-wide mb-2 font-medium">Corequisite Violations</h4>
              <div className="space-y-1">
                {validation.coreqViolations.map((v) => (
                  <div key={v.courseId} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="font-mono text-indigo-300 text-xs">{v.courseNumber}</span>
                    <span className="text-slate-500 text-xs">in {v.semesterLabel} — missing:</span>
                    <span className="text-xs text-amber-300 font-mono">
                      {v.missing.map((id) => id.replace("-", " ")).join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Term load issues */}
          {validation.termLoadIssues.length > 0 && (
            <div>
              <h4 className="text-xs text-[#d4a843] uppercase tracking-wide mb-2 font-medium">Term Load Warnings</h4>
              <div className="space-y-1">
                {validation.termLoadIssues.map((t) => (
                  <div key={t.semesterId} className="flex items-center gap-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full ${t.kind === "overloaded" ? "bg-red-500" : "bg-amber-500"} shrink-0`} />
                    <span className="text-slate-900">{t.semesterLabel}</span>
                    <span className="text-slate-500">
                      {t.credits} credits — {t.kind === "overloaded" ? "over 18 limit" : "under 12 minimum"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unplanned required courses */}
          {validation.unplannedRequired.length > 0 && (
            <div>
              <h4 className="text-xs text-indigo-400 uppercase tracking-wide mb-2 font-medium">Unplanned Required Courses</h4>
              <div className="space-y-1">
                {validation.unplannedRequired.map((u) => (
                  <div key={u.courseId} className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                    <span className="font-mono text-indigo-300">{u.courseNumber}</span>
                    <span className="text-slate-500 truncate">needed for: {u.groups.join(", ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unmet requirements summary */}
          {validation.unmetRequirements.length > 0 && (
            <div>
              <h4 className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-medium">Unmet Requirements ({validation.unmetRequirements.length})</h4>
              <div className="space-y-1">
                {validation.unmetRequirements.slice(0, 10).map((r) => (
                  <div key={r.groupId} className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2a2a3a] shrink-0" />
                    <span className="text-[#8888a8] flex-1 truncate">{r.groupName}</span>
                    <span className="text-slate-400 font-mono shrink-0">
                      {r.completed}/{r.total}
                      {r.inProgress > 0 && <span className="text-[#d4a843]"> +{r.inProgress}</span>}
                    </span>
                  </div>
                ))}
                {validation.unmetRequirements.length > 10 && (
                  <span className="text-[10px] text-slate-400">
                    …and {validation.unmetRequirements.length - 10} more
                  </span>
                )}
              </div>
            </div>
          )}

          {validation.clean && (
            <p className="text-xs text-green-400/80">No prerequisite violations, corequisite issues, or unplanned required courses.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PlannerWorkspace({
  embedded = false,
  compact = false,
  refreshKey = 0,
}: {
  embedded?: boolean;
  compact?: boolean;
  refreshKey?: number;
} = {}) {
  const isCompact = embedded || compact;
  const [courses, setCourses] = useState<Course[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unplannedCollapsed, setUnplannedCollapsed] = useState(false);
  const [completedVisibleCount, setCompletedVisibleCount] = useState(1);

  // Local assignment state: courseId → semId | 'unplanned'
  const [assignments, setAssignments] = useState<Map<string, string>>(new Map());

  // Drag state
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);

  // Modals
  const [prereqModal, setPrereqModal] = useState<PrereqModal | null>(null);
  const [cascadeModal, setCascadeModal] = useState<CascadeModal | null>(null);
  const [newSemModal, setNewSemModal] = useState(false);
  const [newSemForm, setNewSemForm] = useState<NewSemForm>({ type: "fall", year: 2027 });
  const [newSemLoading, setNewSemLoading] = useState(false);
  const [requirements, setRequirements] = useState<RequirementGroup[]>([]);
  const [validationOpen, setValidationOpen] = useState(false);

  // Sensors for DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // Load data
  useEffect(() => {
    Promise.all([
      fetch("/api/courses").then((r) => r.json()),
      fetch("/api/semesters").then((r) => r.json()),
      fetch("/api/requirements").then((r) => r.json()),
    ]).then(([c, s, r]) => {
      const courseList: Course[] = Array.isArray(c) ? c : [];
      const semList: Semester[] = Array.isArray(s) ? s : [];
      setRequirements(Array.isArray(r) ? r : []);
      setCourses(courseList);
      setSemesters(semList);

      // Build initial assignment map from course.semester
      const map = new Map<string, string>();
      for (const course of courseList) {
        map.set(course.id, course.semester ?? "unplanned");
      }
      setAssignments(map);
      setLoading(false);
    }).catch((err) => { setError(String(err)); setLoading(false); });
  }, [refreshKey]);

  const sortedSems = useMemo(() => sortSemesters(semesters), [semesters]);
  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const visibleSems = useMemo(() => {
    const completed = sortedSems.filter((s) => s.status === "completed");
    const active = sortedSems.filter((s) => s.status !== "completed");
    const visibleCompleted =
      completedVisibleCount >= completed.length
        ? completed
        : completed.slice(Math.max(0, completed.length - completedVisibleCount));
    return sortSemesters([...visibleCompleted, ...active]).reverse();
  }, [sortedSems, completedVisibleCount]);

  // Plan-level validation summary
  const validation = useMemo(
    () => validatePlan(courses, semesters, requirements, assignments),
    [courses, semesters, requirements, assignments]
  );

  const auditViews = useMemo(
    () => buildAuditRequirementViewModels({ courses, requirements, semesters }),
    [courses, requirements, semesters]
  );

  // Derive which courses are in each container
  const unplannedCourses = useMemo(
    () =>
      courses.filter((c) => {
        if (c.id.endsWith("-0000")) return false;
        if (c.status === "completed" || c.status === "in_progress" || c.status === "registered") return false;
        return (assignments.get(c.id) ?? "unplanned") === "unplanned";
      }),
    [courses, assignments]
  );

  const unplannedRequirementGroups = useMemo(
    () => buildUnplannedRequirementGroups(auditViews, unplannedCourses),
    [auditViews, unplannedCourses]
  );

  const semCourses = useMemo(() => {
    const map = new Map<string, Course[]>();
    for (const sem of sortedSems) map.set(sem.id, []);

    for (const course of courses) {
      const semId = assignments.get(course.id) ?? "unplanned";
      if (semId !== "unplanned" && map.has(semId)) {
        map.get(semId)!.push(course);
      } else if (semId === "unplanned" && (course.status === "completed" || course.status === "in_progress" || course.status === "registered")) {
        // Completed/in-progress/registered courses: put them in their semester from course.semester
        if (course.semester && map.has(course.semester)) {
          map.get(course.semester)!.push(course);
        }
      }
    }
    return map;
  }, [courses, sortedSems, assignments]);

  const activeCourse = activeCourseId ? courseMap.get(activeCourseId) : null;

  // Perform the actual move (optimistic update + API sync)
  const doMove = useCallback(
    async (courseId: string, toSemId: string) => {
      // Save previous state before any updates so revert uses a stable reference
      const prevAssignments = new Map(assignments);

      const newAssignments = new Map(assignments);
      newAssignments.set(courseId, toSemId);
      setAssignments(newAssignments);

      const course = courseMap.get(courseId);
      if (!course) return;

      try {
        await fetch(`/api/courses/${courseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildCourseSemesterPatch(course, toSemId !== "unplanned" ? toSemId : null)),
        });
        // Refresh course list to get updated status
        const updated = await fetch("/api/courses").then((r) => r.json());
        if (Array.isArray(updated)) setCourses(updated);
      } catch {
        // Revert on error using saved pre-move state
        setAssignments(prevAssignments);
      }
    },
    [assignments, courseMap]
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveCourseId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCourseId(null);
    if (!over) return;

    const courseId = active.id as string;
    const toSemId = over.id as string;
    const fromSemId = assignments.get(courseId) ?? "unplanned";

    if (fromSemId === toSemId) return;

    const course = courseMap.get(courseId);
    if (!course) return;

    // Block drops onto completed semesters (except unplanned)
    const toSem = semesters.find((s) => s.id === toSemId);
    if (toSem?.status === "completed") return;

    // Cascade warnings (moving to a later planned semester)
    const fromIdx = sortedSems.findIndex((s) => s.id === fromSemId);
    const toIdx = sortedSems.findIndex((s) => s.id === toSemId);
    if (fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx) {
      const cascade = getCascadeWarnings(courseId, fromSemId, toSemId, courses, sortedSems, assignments);
      if (cascade.length > 0) {
        setCascadeModal({
          course,
          fromSemLabel: semIdToLabel(fromSemId, sortedSems),
          toSemLabel: semIdToLabel(toSemId, sortedSems),
          affected: cascade,
          onConfirm: () => {
            setCascadeModal(null);
            // Still validate prereqs after cascade warning
            if (toSem) {
              const validation = validateDrop(course, toSemId, courses, sortedSems, assignments);
              if (!validation.valid) {
                setPrereqModal({ course, toSemLabel: toSem.label, validation });
                return;
              }
            }
            doMove(courseId, toSemId);
          },
        });
        return;
      }
    }

    // Prereq validation
    if (toSemId !== "unplanned" && toSem) {
      const validation = validateDrop(course, toSemId, courses, sortedSems, assignments);
      if (!validation.valid) {
        setPrereqModal({ course, toSemLabel: toSem.label, validation });
        return;
      }
    }

    doMove(courseId, toSemId);
  }

  // Create new semester
  async function handleCreateSemester() {
    setNewSemLoading(true);
    const typePrefix: Record<string, string> = { fall: "FA", spring: "SP", summer: "SU" };
    const id = `${typePrefix[newSemForm.type]}${newSemForm.year.toString().slice(-2)}`;
    const label = `${newSemForm.type.charAt(0).toUpperCase() + newSemForm.type.slice(1)} ${newSemForm.year}`;

    try {
      const res = await fetch("/api/semesters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          label,
          type: newSemForm.type,
          year: newSemForm.year,
          status: "planned",
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setSemesters((prev) => sortSemesters([...prev, created]));
        setNewSemModal(false);
      }
    } catch { /* ignore */ }
    setNewSemLoading(false);
  }

  async function handleSemesterStatusChange(semesterId: string, status: Semester["status"]) {
    const previous = semesters;
    setSemesters((prev) => prev.map((s) => (s.id === semesterId ? { ...s, status } : s)));
    try {
      const res = await fetch(`/api/semesters/${semesterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update semester");
      const updated = await res.json();
      setSemesters((prev) => prev.map((s) => (s.id === semesterId ? updated : s)));
    } catch {
      setSemesters(previous);
    }
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${embedded ? "min-h-40" : "min-h-screen"} text-slate-500`}>Loading…</div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center ${embedded ? "min-h-40" : "min-h-screen"} text-red-400 text-sm p-8`}>
        Failed to load planner data: {error}
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center ${embedded ? "min-h-40" : "min-h-screen"} gap-4 p-8 text-center`}>
        <p className="text-slate-500">No course data yet.</p>
        <a href="/upload" className="text-[#d4a843] hover:text-[#e8c068] text-sm">
          Upload an audit PDF →
        </a>
      </div>
    );
  }

  return (
    <>
      {!embedded && (
        <style>{`
          @media (max-width: 767px) {
            body { display: block; }
            body > aside { display: none !important; }
            body > main { width: 100vw; min-height: 100vh; overflow: visible; }
          }
        `}</style>
      )}
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={`${isCompact ? "space-y-3" : "min-h-screen space-y-6 bg-gradient-to-br from-sky-50 via-white to-amber-50 p-4 text-slate-900 sm:p-6"}`}>
        {/* Header */}
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          {!embedded && (
            <div>
              <h2 className="text-3xl font-semibold text-slate-950">Semester Planner</h2>
              <p className="text-slate-500 text-sm mt-0.5">
                Plan by requirement, then place courses into semesters.
              </p>
            </div>
          )}
          {embedded && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Semester timeline</h3>
              <p className="text-xs text-slate-500 mt-0.5">Attach remaining requirements to terms. Drops still validate prereqs/coreqs.</p>
            </div>
          )}
          <button
            onClick={() => setNewSemModal(true)}
            className={`${embedded ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} flex shrink-0 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 font-medium text-sky-700 transition-colors hover:bg-sky-100`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Semester
          </button>
        </div>

        {/* Validation Panel */}
        <ValidationPanel
          validation={validation}
          open={validationOpen}
          onToggle={() => setValidationOpen((v) => !v)}
        />

        {/* Legend */}
        <div className={`${embedded ? "hidden" : "hidden"} items-center gap-4 text-[10px] text-slate-400`}>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> completed</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#d4a843]" /> in progress</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" /> registered</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500" /> planned</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#2a2a3a]" /> not started</span>
          <span className="ml-2 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> prereqs ok</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> prereqs missing</span>
        </div>

        {sortedSems.some((s) => s.status === "completed") && (
          <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div>
              <div className="text-sm font-semibold text-slate-900">Completed semesters</div>
              <div className="text-xs text-slate-500">
                Showing {Math.min(completedVisibleCount, sortedSems.filter((s) => s.status === "completed").length)} of {sortedSems.filter((s) => s.status === "completed").length} in the planner.
              </div>
            </div>
            <select
              value={completedVisibleCount}
              onChange={(e) => setCompletedVisibleCount(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-300"
            >
              <option value={0}>Hide all</option>
              <option value={1}>Most recent</option>
              <option value={2}>Last 2</option>
              <option value={999}>Show all</option>
            </select>
          </div>
        )}

        {/* Unplanned pool */}
        <UnplannedPool
          courses={unplannedCourses}
          allCourses={courses}
          sortedSems={sortedSems}
          assignments={assignments}
          requirementGroups={unplannedRequirementGroups}
          collapsed={unplannedCollapsed}
          onToggle={() => setUnplannedCollapsed((v) => !v)}
        />

        {/* Semester timeline */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleSems.map((sem) => (
              <SemesterColumn
                key={sem.id}
                semester={sem}
                courses={semCourses.get(sem.id) ?? []}
                allCourses={courses}
                sortedSems={sortedSems}
                assignments={assignments}
                onStatusChange={handleSemesterStatusChange}
              />
            ))}

          {sortedSems.length === 0 && (
            <div className="flex h-32 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white text-sm text-slate-400 sm:col-span-2 xl:col-span-3 2xl:col-span-4">
              No semesters yet. Add one to start planning.
            </div>
          )}
        </div>
      </div>

      {/* Drag overlay (ghost card) */}
      <DragOverlay dropAnimation={null}>
        {activeCourse ? (
          <PlannerCard
            course={activeCourse}
            semId={assignments.get(activeCourse.id) ?? "unplanned"}
            allCourses={courses}
            sortedSems={sortedSems}
            assignments={assignments}
            overlay
          />
        ) : null}
      </DragOverlay>

      {/* Prereq validation modal */}
      {prereqModal && (
        <Modal onClose={() => setPrereqModal(null)}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-base">Prerequisite conflict</h3>
              <p className="text-slate-500 text-sm mt-1">
                Can&apos;t place{" "}
                <span className="text-indigo-300 font-mono">{prereqModal.course.number}</span> in{" "}
                <span className="text-[#d4a843]">{prereqModal.toSemLabel}</span>.
              </p>
            </div>
          </div>

          {prereqModal.validation.missingPrereqs.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Missing prerequisites</p>
              <div className="space-y-1">
                {prereqModal.validation.missingPrereqs.map((id) => (
                  <div key={id} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    <span className="font-mono text-indigo-300">{formatCourseId(id)}</span>
                    <span className="text-slate-500">required in an earlier semester</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {prereqModal.validation.missingCoreqs.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Missing corequisites</p>
              <div className="space-y-1">
                {prereqModal.validation.missingCoreqs.map((id) => (
                  <div key={id} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="font-mono text-indigo-300">{formatCourseId(id)}</span>
                    <span className="text-slate-500">required in the same or earlier semester</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setPrereqModal(null)}
            className="w-full py-2.5 bg-[#1e1e34] hover:bg-[#2a2a40] border border-slate-200 rounded-xl text-sm transition-colors"
          >
            Got it
          </button>
        </Modal>
      )}

      {/* Cascade warning modal */}
      {cascadeModal && (
        <Modal onClose={() => setCascadeModal(null)}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-base">Cascade warning</h3>
              <p className="text-slate-500 text-sm mt-1">
                Moving{" "}
                <span className="text-indigo-300 font-mono">{cascadeModal.course.number}</span> to{" "}
                <span className="text-[#d4a843]">{cascadeModal.toSemLabel}</span> would break
                prerequisites for:
              </p>
            </div>
          </div>

          <div className="bg-[#0e0e1c] border border-slate-200 rounded-xl p-3 space-y-1.5">
            {cascadeModal.affected.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="font-mono text-indigo-300">{item.number}</span>
                <span className="text-slate-500 flex-1 truncate">{item.name}</span>
                <span className="text-[10px] text-slate-400">{item.semLabel}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={cascadeModal.onConfirm}
              className="flex-1 py-2.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/20 text-amber-300 rounded-xl text-sm font-medium transition-colors"
            >
              Move anyway
            </button>
            <button
              onClick={() => setCascadeModal(null)}
              className="flex-1 py-2.5 bg-[#1e1e34] hover:bg-[#2a2a40] border border-slate-200 rounded-xl text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* New semester modal */}
      {newSemModal && (
        <Modal onClose={() => setNewSemModal(false)}>
          <h3 className="font-semibold text-slate-900 text-base">Add Planned Semester</h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wide mb-1.5 block">Term</label>
              <div className="flex gap-2">
                {(["fall", "spring", "summer"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setNewSemForm((f) => ({ ...f, type: t }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      newSemForm.type === t
                        ? "bg-[#d4a843]/15 border-[#d4a843]/30 text-[#d4a843]"
                        : "bg-[#1a1a2e] border-slate-200 text-slate-500 hover:text-[#8888a8]"
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wide mb-1.5 block">Year</label>
              <input
                type="number"
                value={newSemForm.year}
                min={2024}
                max={2035}
                onChange={(e) => setNewSemForm((f) => ({ ...f, year: parseInt(e.target.value) || f.year }))}
                className="w-full px-3 py-2 bg-[#1a1a2e] border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-sky-300"
              />
            </div>

            <div className="text-xs text-slate-500 bg-[#0e0e1c] border border-slate-200 rounded-lg px-3 py-2">
              Will create:{" "}
              <span className="text-[#d4a843] font-medium">
                {newSemForm.type.charAt(0).toUpperCase() + newSemForm.type.slice(1)} {newSemForm.year}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCreateSemester}
              disabled={newSemLoading}
              className="flex-1 py-2.5 bg-[#d4a843] hover:bg-[#e8c068] disabled:opacity-50 text-[#0a0a12] rounded-xl text-sm font-semibold transition-colors"
            >
              {newSemLoading ? "Creating…" : "Create Semester"}
            </button>
            <button
              onClick={() => setNewSemModal(false)}
              className="flex-1 py-2.5 bg-[#1e1e34] hover:bg-[#2a2a40] border border-slate-200 rounded-xl text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </DndContext>
    </>
  );
}
