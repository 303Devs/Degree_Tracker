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
import {
  buildPlannerBoardViewModel,
  type PlannerBoardViewModel,
  type PlannerCoursePlacement,
} from "@/lib/planner-board-view";

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

// ---------------------------------------------------------------------------
// Course card (draggable)
// ---------------------------------------------------------------------------

function PlannerCard({
  course,
  semId,
  allCourses,
  sortedSems,
  assignments,
  placement,
  overlay = false,
}: {
  course: Course;
  semId: SemId;
  allCourses: Course[];
  sortedSems: Semester[];
  assignments: Map<string, string>;
  placement?: PlannerCoursePlacement;
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
    completed:   "bg-[var(--status-complete)]",
    in_progress: "bg-amber-500",
    registered:  "bg-amber-400",
    planned:     "bg-purple-400",
    not_started: "bg-[var(--text-muted)]",
  };

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      className={[
        "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-card)] select-none transition-all duration-150",
        isDragging ? "opacity-30 scale-95" : "",
        overlay ? "rotate-1 scale-105 border-[var(--accent)] bg-[var(--surface)] shadow-[var(--shadow-elevated)]" : "",
        !overlay && draggable ? "cursor-grab active:cursor-grabbing hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]" : "",
        !overlay && !draggable ? "cursor-default opacity-80" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs font-mono font-semibold text-[var(--accent)]">{course.number}</span>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--text-secondary)]">{course.name}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="text-[10px] text-[var(--text-muted)]">{course.credits}cr</span>
          <span className={`w-2 h-2 rounded-full ${statusDot[course.status] ?? "bg-[var(--text-muted)]"}`} />
        </div>
      </div>
      {/* Prereq indicator */}
      {course.prereqs && semId !== "unplanned" && (
        <div className="mt-2 flex items-center gap-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${prereqOk ? "bg-green-500" : "bg-rose-500"}`}
          />
          <span className={`text-[10px] ${prereqOk ? "text-green-700" : "text-rose-600"}`}>
            {prereqOk ? "prereqs ok" : "prereqs missing"}
          </span>
        </div>
      )}
      {placement?.requirementLabels.length ? (
        <p className="mt-2 truncate text-[10px] text-[var(--text-muted)]">For: {placement.requirementLabels[0]}</p>
      ) : null}
      {placement?.blockedReasons.length ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-700">{placement.blockedReasons[0]}</p>
      ) : null}
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
  summary,
  onStatusChange,
}: {
  semester: Semester;
  courses: Course[];
  allCourses: Course[];
  sortedSems: Semester[];
  assignments: Map<string, string>;
  summary?: PlannerBoardViewModel["semesterSummaries"][number];
  onStatusChange: (semesterId: string, status: Semester["status"]) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: semester.id });

  const totalCredits = courses.reduce((a, c) => a + c.credits, 0);
  const creditWarn = totalCredits > 18 || (totalCredits > 0 && totalCredits < 12 && (semester.status === "planned"));

  const headerBg: Record<string, string> = {
    completed: "border-green-200 bg-green-50",
    in_progress: "border-amber-200 bg-amber-50",
    registered: "border-blue-200 bg-blue-50",
    planned: "border-[var(--border)] bg-[var(--surface-subtle)]",
  };

  const ringColor = isOver ? "ring-2 ring-[var(--accent)]/20 border-[var(--accent)]" : "";

  return (
    <div
      className={`w-full flex-shrink-0 rounded-2xl border bg-[var(--surface)] shadow-[var(--shadow-card)] transition-all duration-150 sm:w-72 ${headerBg[semester.status] ?? "border-[var(--border)]"} ${ringColor}`}
    >
      {/* Column header */}
      <div className={`border-b border-[var(--border)] px-3 py-3 ${headerBg[semester.status] ?? ""}`}>
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold leading-none text-[var(--text-primary)]">{semester.label}</span>
          <select
            value={semester.status}
            onChange={(e) => onStatusChange(semester.id, e.target.value as Semester["status"])}
            className="max-w-[7.5rem] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)]"
            aria-label={`Set ${semester.label} status`}
          >
            <option value="completed">completed</option>
            <option value="in_progress">in progress</option>
            <option value="registered">registered</option>
            <option value="planned">planned</option>
          </select>
        </div>
        <div className={`mt-2 text-[11px] ${creditWarn ? "text-amber-700" : "text-[var(--text-muted)]"}`}>
          {totalCredits} credits{creditWarn ? (totalCredits > 18 ? " — overloaded" : " — underloaded") : ""}{summary && summary.conflicts > 0 ? ` · ${summary.conflicts} issue${summary.conflicts === 1 ? "" : "s"}` : ""}
        </div>
      </div>

      {/* Droppable body */}
      <div ref={setNodeRef} className="min-h-[120px] flex-1 space-y-2 p-2">
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
              isOver ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"
            }`}
          >
            <span className="text-[10px] text-[var(--text-muted)]">drop here</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unplanned pool (droppable)
// ---------------------------------------------------------------------------

function UnplannedPool({
  groups,
  allCourses,
  sortedSems,
  assignments,
  collapsed,
  onToggle,
}: {
  groups: PlannerBoardViewModel["courseGroups"];
  allCourses: Course[];
  sortedSems: Semester[];
  assignments: Map<string, string>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: "unplanned" });

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-[var(--surface)] shadow-[var(--shadow-card)] transition-all ${
        isOver ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/20" : "border-[var(--border)]"
      }`}
    >
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--surface-subtle)]"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Courses to place</span>
          <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs tabular-nums text-[var(--accent)]">
            {groups.reduce((sum, group) => sum + group.courses.length, 0)}
          </span>
        </div>
        <svg
          className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${collapsed ? "" : "rotate-180"}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div ref={setNodeRef} className="space-y-4 border-t border-[var(--border)] p-3 sm:p-4">
          {groups.length === 0 ? (
            <div
              className={`flex h-16 items-center justify-center rounded-lg border border-dashed transition-colors ${
                isOver ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"
              }`}
            >
              <span className="text-xs text-[var(--text-muted)]">All courses are planned</span>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.id} className="space-y-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{group.title}</h3>
                  <p className="text-xs text-[var(--text-secondary)]">{group.detail}</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.courses.map((placement) => (
                    <PlannerCard
                      key={placement.course.id}
                      course={placement.course}
                      semId="unplanned"
                      allCourses={allCourses}
                      sortedSems={sortedSems}
                      assignments={assignments}
                      placement={placement}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

function PlannerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
      <div className="truncate text-lg font-semibold text-[var(--text-primary)]">{value}</div>
      <div className="mt-1 text-[11px] font-medium text-[var(--text-secondary)]">{label}</div>
    </div>
  );
}

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
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
    ? "border-[var(--border)] bg-[var(--surface)]"
    : "border-[var(--border)] bg-[var(--surface)]";
  const statusIcon = validation.clean ? "✓" : "⚠";
  const statusIconClass = validation.clean ? "text-[var(--status-complete)]" : "text-[var(--status-progress)]";

  return (
    <div className={`rounded-xl border ${statusColor} overflow-hidden transition-all`}>
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--surface-subtle)]"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className={`text-sm ${statusIconClass}`}>
            {statusIcon}
          </span>
          <div>
            <span className="text-sm font-semibold text-[var(--text-primary)]">Plan Validation</span>
            <span className="text-xs text-[var(--text-secondary)] ml-2">
              {validation.clean
                ? "All clear"
                : `${issueCount} issue${issueCount !== 1 ? "s" : ""}${unmetCount > 0 ? `, ${unmetCount} unmet req${unmetCount !== 1 ? "s" : ""}` : ""}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {validation.projectedCompletionTerm && (
            <span className="text-[10px] text-[var(--text-secondary)]">
              Est. completion: <span className="text-[var(--accent)]">{validation.projectedCompletionTerm.semesterLabel}</span>
            </span>
          )}
          <svg
            className={`w-4 h-4 text-[var(--text-secondary)] transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] p-4 space-y-4">
          {/* Prereq violations */}
          {validation.prereqViolations.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--status-blocked)]">Prerequisite Violations</h4>
              <div className="space-y-1">
                {validation.prereqViolations.map((v) => (
                  <div key={v.courseId} className="flex items-center gap-2 text-sm">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-blocked)]" />
                    <span className="font-mono text-[var(--accent)] text-xs">{v.courseNumber}</span>
                    <span className="text-[var(--text-secondary)] text-xs">in {v.semesterLabel} — missing:</span>
                    <span className="font-mono text-xs text-[var(--status-blocked)]">
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
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--status-progress)]">Corequisite Violations</h4>
              <div className="space-y-1">
                {validation.coreqViolations.map((v) => (
                  <div key={v.courseId} className="flex items-center gap-2 text-sm">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-progress)]" />
                    <span className="font-mono text-[var(--accent)] text-xs">{v.courseNumber}</span>
                    <span className="text-[var(--text-secondary)] text-xs">in {v.semesterLabel} — missing:</span>
                    <span className="font-mono text-xs text-[var(--status-progress)]">
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
              <h4 className="text-xs text-[var(--accent)] uppercase tracking-wide mb-2 font-medium">Term Load Warnings</h4>
              <div className="space-y-1">
                {validation.termLoadIssues.map((t) => (
                  <div key={t.semesterId} className="flex items-center gap-2 text-xs">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.kind === "overloaded" ? "bg-[var(--status-blocked)]" : "bg-[var(--status-progress)]"}`} />
                    <span className="text-[var(--text-primary)]">{t.semesterLabel}</span>
                    <span className="text-[var(--text-secondary)]">
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
              <h4 className="text-xs text-[var(--accent)] uppercase tracking-wide mb-2 font-medium">Unplanned Required Courses</h4>
              <div className="space-y-1">
                {validation.unplannedRequired.map((u) => (
                  <div key={u.courseId} className="flex items-center gap-2 text-xs">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                    <span className="font-mono text-[var(--accent)]">{u.courseNumber}</span>
                    <span className="text-[var(--text-secondary)] truncate">needed for: {u.groups.join(", ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unmet requirements summary */}
          {validation.unmetRequirements.length > 0 && (
            <div>
              <h4 className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-2 font-medium">Unmet Requirements ({validation.unmetRequirements.length})</h4>
              <div className="space-y-1">
                {validation.unmetRequirements.slice(0, 10).map((r) => (
                  <div key={r.groupId} className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] shrink-0" />
                    <span className="text-[var(--text-secondary)] flex-1 truncate">{r.groupName}</span>
                    <span className="text-[var(--text-muted)] font-mono shrink-0">
                      {r.completed}/{r.total}
                      {r.inProgress > 0 && <span className="text-[var(--accent)]"> +{r.inProgress}</span>}
                    </span>
                  </div>
                ))}
                {validation.unmetRequirements.length > 10 && (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    …and {validation.unmetRequirements.length - 10} more
                  </span>
                )}
              </div>
            </div>
          )}

          {validation.clean && (
            <p className="text-xs text-[var(--status-complete)]">No prerequisite violations, corequisite issues, or unplanned required courses.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PlannerWorkspace({ embedded = false }: { embedded?: boolean } = {}) {
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
  }, []);

  const sortedSems = useMemo(() => sortSemesters(semesters), [semesters]);
  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const visibleSems = useMemo(() => {
    const completed = sortedSems.filter((s) => s.status === "completed");
    const active = sortedSems.filter((s) => s.status !== "completed");
    const visibleCompleted =
      completedVisibleCount >= completed.length
        ? completed
        : completed.slice(Math.max(0, completed.length - completedVisibleCount));
    return sortSemesters([...visibleCompleted, ...active]);
  }, [sortedSems, completedVisibleCount]);

  // Plan-level validation summary
  const validation = useMemo(
    () => validatePlan(courses, semesters, requirements, assignments),
    [courses, semesters, requirements, assignments]
  );

  const boardView = useMemo(
    () => buildPlannerBoardViewModel({ courses, semesters, requirements, assignments, validation }),
    [courses, semesters, requirements, assignments, validation]
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
          body: JSON.stringify({
            semester: toSemId !== "unplanned" ? toSemId : null,
            status:
              toSemId !== "unplanned" && course.status === "not_started"
                ? "planned"
                : toSemId === "unplanned" && course.status === "planned"
                ? "not_started"
                : course.status,
          }),
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
      <div className={`flex items-center justify-center ${embedded ? "min-h-40" : "min-h-screen"} text-[var(--text-secondary)]`}>Loading…</div>
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
        <p className="text-[var(--text-secondary)]">No course data yet.</p>
        <a href="/upload" className="text-[var(--accent)] hover:text-[var(--accent)] text-sm">
          Upload an audit PDF →
        </a>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={`${embedded ? "space-y-4" : "min-h-screen space-y-5 bg-[var(--page-bg)] px-3 py-5 pb-8 text-[var(--text-primary)] sm:px-6 lg:px-8"}`}>
        {/* Header */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          {!embedded && (
            <div className="max-w-3xl">
              <p className="text-xs font-semibold text-[var(--accent)]">Semester Planner</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">Build a plan you can register from</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Place courses into terms, see what is blocked, and catch timing issues before registration.
              </p>
            </div>
          )}
          {embedded && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Semester timeline</h3>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Attach remaining requirements to terms. Drops still validate prereqs/coreqs.</p>
            </div>
          )}
          <button
            onClick={() => setNewSemModal(true)}
            className="flex w-fit items-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--surface-subtle)]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Semester
          </button>
          </div>
          {!embedded && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <PlannerMetric label="still unplanned" value={String(boardView.summary.unplannedCount)} />
              <PlannerMetric label="blocked" value={String(boardView.summary.blockedCount)} />
              <PlannerMetric label="plan issues" value={String(boardView.summary.conflictCount)} />
              <PlannerMetric label="projected finish" value={boardView.summary.projectedCompletionLabel ?? "TBD"} />
            </div>
          )}
        </div>

        {/* Unplanned pool */}
        <UnplannedPool
          groups={boardView.courseGroups}
          allCourses={courses}
          sortedSems={sortedSems}
          assignments={assignments}
          collapsed={unplannedCollapsed}
          onToggle={() => setUnplannedCollapsed((v) => !v)}
        />

        {/* Semester timeline */}
        <div className="pb-4 sm:overflow-x-auto">
          <div className="grid min-w-0 gap-3 sm:flex sm:min-w-max">
            {visibleSems.map((sem) => (
              <SemesterColumn
                key={sem.id}
                semester={sem}
                courses={semCourses.get(sem.id) ?? []}
                allCourses={courses}
                sortedSems={sortedSems}
                assignments={assignments}
                summary={boardView.semesterSummaries.find((item) => item.semester.id === sem.id)}
                onStatusChange={handleSemesterStatusChange}
              />
            ))}

            {sortedSems.length === 0 && (
              <div className="flex h-32 items-center justify-center text-sm text-[var(--text-muted)]">
                No semesters yet. Add one to start planning.
              </div>
            )}
          </div>
        </div>

        {sortedSems.some((s) => s.status === "completed") && (
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">Completed semesters</div>
              <div className="text-xs text-[var(--text-secondary)]">
                Showing {Math.min(completedVisibleCount, sortedSems.filter((s) => s.status === "completed").length)} of {sortedSems.filter((s) => s.status === "completed").length} in the planner.
              </div>
            </div>
            <select
              value={completedVisibleCount}
              onChange={(e) => setCompletedVisibleCount(Number(e.target.value))}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value={0}>Hide all</option>
              <option value={1}>Most recent</option>
              <option value={2}>Last 2</option>
              <option value={999}>Show all</option>
            </select>
          </div>
        )}

        {/* Validation Panel */}
        <ValidationPanel
          validation={validation}
          open={validationOpen}
          onToggle={() => setValidationOpen((v) => !v)}
        />      </div>

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
              <h3 className="font-semibold text-[var(--text-primary)] text-base">Prerequisite conflict</h3>
              <p className="text-[var(--text-secondary)] text-sm mt-1">
                Can&apos;t place{" "}
                <span className="text-[var(--accent)] font-mono">{prereqModal.course.number}</span> in{" "}
                <span className="text-[var(--accent)]">{prereqModal.toSemLabel}</span>.
              </p>
            </div>
          </div>

          {prereqModal.validation.missingPrereqs.length > 0 && (
            <div>
              <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-2">Missing prerequisites</p>
              <div className="space-y-1">
                {prereqModal.validation.missingPrereqs.map((id) => (
                  <div key={id} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    <span className="font-mono text-[var(--accent)]">{formatCourseId(id)}</span>
                    <span className="text-[var(--text-secondary)]">required in an earlier semester</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {prereqModal.validation.missingCoreqs.length > 0 && (
            <div>
              <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-2">Missing corequisites</p>
              <div className="space-y-1">
                {prereqModal.validation.missingCoreqs.map((id) => (
                  <div key={id} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="font-mono text-[var(--accent)]">{formatCourseId(id)}</span>
                    <span className="text-[var(--text-secondary)]">required in the same or earlier semester</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setPrereqModal(null)}
            className="w-full py-2.5 bg-[var(--surface-subtle)] hover:bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl text-sm transition-colors"
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
              <h3 className="font-semibold text-[var(--text-primary)] text-base">Cascade warning</h3>
              <p className="text-[var(--text-secondary)] text-sm mt-1">
                Moving{" "}
                <span className="text-[var(--accent)] font-mono">{cascadeModal.course.number}</span> to{" "}
                <span className="text-[var(--accent)]">{cascadeModal.toSemLabel}</span> would break
                prerequisites for:
              </p>
            </div>
          </div>

          <div className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl p-3 space-y-1.5">
            {cascadeModal.affected.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="font-mono text-[var(--accent)]">{item.number}</span>
                <span className="text-[var(--text-secondary)] flex-1 truncate">{item.name}</span>
                <span className="text-[10px] text-[var(--text-muted)]">{item.semLabel}</span>
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
              className="flex-1 py-2.5 bg-[var(--surface-subtle)] hover:bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* New semester modal */}
      {newSemModal && (
        <Modal onClose={() => setNewSemModal(false)}>
          <h3 className="font-semibold text-[var(--text-primary)] text-base">Add Planned Semester</h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1.5 block">Term</label>
              <div className="flex gap-2">
                {(["fall", "spring", "summer"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setNewSemForm((f) => ({ ...f, type: t }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      newSemForm.type === t
                        ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
                        : "bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1.5 block">Year</label>
              <input
                type="number"
                value={newSemForm.year}
                min={2024}
                max={2035}
                onChange={(e) => setNewSemForm((f) => ({ ...f, year: parseInt(e.target.value) || f.year }))}
                className="w-full px-3 py-2 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="text-xs text-[var(--text-secondary)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-lg px-3 py-2">
              Will create:{" "}
              <span className="text-[var(--accent)] font-medium">
                {newSemForm.type.charAt(0).toUpperCase() + newSemForm.type.slice(1)} {newSemForm.year}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCreateSemester}
              disabled={newSemLoading}
              className="flex-1 rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent)] disabled:opacity-50"
            >
              {newSemLoading ? "Creating…" : "Create Semester"}
            </button>
            <button
              onClick={() => setNewSemModal(false)}
              className="flex-1 py-2.5 bg-[var(--surface-subtle)] hover:bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </DndContext>
  );
}
