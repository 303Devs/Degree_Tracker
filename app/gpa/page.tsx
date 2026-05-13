"use client";

import { useState, useEffect, useMemo } from "react";
import type { Course, RequirementGroup, ProgramInfo } from "@/lib/types";
import {
  GRADE_OPTIONS,
  GRADE_SCALE,
  gradeToPoints,
  calcGPA,
  solveTargetGrade,
} from "@/lib/prereqs";
import { computeProgressSemantics, type ProgressSemanticsSummary } from "@/lib/progress";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gradeColor(grade: string): string {
  const p = GRADE_SCALE[grade] ?? -1;
  if (p < 0) return "text-[var(--text-secondary)]";
  if (p >= 3.7) return "text-green-700";
  if (p >= 2.7) return "text-[var(--accent)]";
  if (p >= 1.7) return "text-amber-700";
  return "text-rose-600";
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function GPAPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [requirements, setRequirements] = useState<RequirementGroup[]>([]);
  const [programs, setPrograms] = useState<ProgramInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // What-if: hypothetical grades for planned/in-progress courses
  const [whatIf, setWhatIf] = useState<Map<string, string>>(new Map());
  const [whatIfEnabled, setWhatIfEnabled] = useState(false);

  // Target grade solver
  const [solverCourse, setSolverCourse] = useState<string>("");
  const [solverTargetGPA, setSolverTargetGPA] = useState<string>("3.0");
  const [solverMode, setSolverMode] = useState<"cumulative" | "major">("cumulative");

  useEffect(() => {
    Promise.all([
      fetch("/api/courses").then((r) => r.json()),
      fetch("/api/requirements").then((r) => r.json()),
      fetch("/api/programs").then((r) => r.json()),
    ]).then(([c, r, p]) => {
      setCourses(Array.isArray(c) ? c : []);
      setRequirements(Array.isArray(r) ? r : []);
      setPrograms(Array.isArray(p) ? p : []);
      setLoading(false);
    }).catch((err) => { setError(String(err)); setLoading(false); });
  }, []);

  // Identify major requirement groups (stats/DS major)
  const majorGroupIds = useMemo(() => {
    return new Set(
      requirements
        .filter((r) =>
          r.category.toLowerCase().includes("statistic") ||
          r.category.toLowerCase().includes("data science") ||
          r.category.toLowerCase().includes("major")
        )
        .flatMap((r) => r.coursePool)
    );
  }, [requirements]);

  // Completed courses with real grades
  const completedGraded = useMemo(
    () => courses.filter((c) => c.status === "completed" && !!c.grade && c.grade !== "HS" && c.grade !== "W" && c.countsTowardGPA !== false),
    [courses]
  );

  // Planned + in-progress + registered courses (candidates for what-if)
  const activeCourses = useMemo(
    () => courses.filter((c) => c.status === "planned" || c.status === "in_progress" || c.status === "registered"),
    [courses]
  );

  // Build combined course set for what-if calculation
  const whatIfCombined = useMemo(() => {
    if (!whatIfEnabled) return completedGraded;
    // Take completed graded + any what-if graded active courses
    const active = activeCourses
      .filter((c) => whatIf.has(c.id))
      .map((c) => ({ ...c, grade: whatIf.get(c.id) }));
    return [...completedGraded, ...active] as Course[];
  }, [completedGraded, activeCourses, whatIf, whatIfEnabled]);

  // Progress semantics summary
  const progressSemantics = useMemo(
    () => computeProgressSemantics(courses, requirements),
    [courses, requirements]
  );

  // Official GPA from audit (authoritative)
  const officialGPA = programs[0]?.gpa ?? 0;

  // GPAs — calculated baseline always uses completedGraded (no what-if)
  const baseCumGPA = calcGPA(completedGraded);

  // What-if projected GPA (delta from calculated baseline)
  const projectedGPA = calcGPA(whatIfCombined);

  const majorGraded = (whatIfEnabled ? whatIfCombined : completedGraded).filter((c) =>
    majorGroupIds.has(c.id)
  );
  const majorGPA = calcGPA(majorGraded);
  const baseMajorGPA = calcGPA(majorGraded.filter((c) => c.status === "completed"));

  // Solver
  const solverResult = useMemo(() => {
    if (!solverCourse || !solverTargetGPA) return null;
    const target = parseFloat(solverTargetGPA);
    if (isNaN(target) || target < 0 || target > 4) return null;
    const course = courses.find((c) => c.id === solverCourse);
    if (!course) return null;
    // For major GPA targeting, restrict the course pool to major courses only
    const pool =
      solverMode === "major"
        ? whatIfCombined.filter((c) => majorGroupIds.has(c.id))
        : whatIfCombined;
    return solveTargetGrade(target, course, pool, whatIf);
  }, [solverCourse, solverTargetGPA, courses, whatIfCombined, whatIf, solverMode, majorGroupIds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-[var(--text-secondary)]">Loading…</div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen text-rose-600 text-sm p-8">
        Failed to load GPA data: {error}
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
        <p className="text-[var(--text-secondary)]">No course data yet.</p>
        <a href="/upload" className="text-[var(--accent)] hover:text-[var(--accent)] text-sm">
          Upload an audit PDF →
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] p-6 sm:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
        <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--accent)] font-semibold">GPA summary</p>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mt-2">Understand your GPA</h2>
        <p className="text-[var(--text-secondary)] text-sm mt-2 max-w-3xl leading-relaxed">
          Review official and calculated GPA, test what-if grades, and see how courses count toward progress.
        </p>
      </div>

      {/* GPA Summary Cards */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">GPA summary</h3>
          <p className="text-xs text-[var(--text-secondary)]">Current standing from completed and audit-backed coursework.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {officialGPA > 0 && (
          <GPACard
            label="Official GPA"
            gpa={officialGPA}
            base={officialGPA}
            changed={false}
            credits={completedGraded.reduce((a, c) => a + c.credits, 0)}
            sub="From degree audit"
            variant="official"
          />
        )}
        {whatIfEnabled ? (
          <GPACard
            label="Projected GPA"
            gpa={projectedGPA}
            base={baseCumGPA}
            changed={Math.abs(projectedGPA - baseCumGPA) > 0.001}
            credits={completedGraded.reduce((a, c) => a + c.credits, 0)}
            sub={`From calculated baseline ${baseCumGPA > 0 ? baseCumGPA.toFixed(3) : "—"}`}
            variant="calculated"
          />
        ) : (
          <GPACard
            label="Calculated GPA"
            gpa={baseCumGPA}
            base={baseCumGPA}
            changed={officialGPA > 0 && Math.abs(baseCumGPA - officialGPA) > 0.001}
            credits={completedGraded.reduce((a, c) => a + c.credits, 0)}
            sub="From graded courses"
            officialDiff={officialGPA > 0 && Math.abs(baseCumGPA - officialGPA) > 0.001 ? officialGPA - baseCumGPA : null}
            variant="calculated"
          />
        )}
        <GPACard
          label="Calculated Major GPA"
          gpa={whatIfEnabled ? majorGPA : baseMajorGPA}
          base={baseMajorGPA}
          changed={whatIfEnabled && Math.abs(majorGPA - baseMajorGPA) > 0.001}
          credits={majorGraded.filter((c) => c.status === "completed").reduce((a, c) => a + c.credits, 0)}
          sub="Stats & DS major courses only"
          variant="major"
        />
        </div>
      </section>

      {/* Counting Semantics Summary */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">How Courses Count</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Not every course counts the same way. Some affect your GPA but not degree progress, or vice versa.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-px bg-[var(--surface-subtle)]">
          <CountingBucketCard
            label="Degree Progress"
            courses={progressSemantics.degreeCountedCourses}
            credits={progressSemantics.degreeCountedCredits}
            color="text-green-700"
          />
          <CountingBucketCard
            label="GPA Calculation"
            courses={progressSemantics.gpaCountedCourses}
            credits={progressSemantics.gpaCountedCredits}
            color="text-[var(--accent)]"
          />
          <CountingBucketCard
            label="Earned Hours"
            courses={progressSemantics.earnedHoursCountedCourses}
            credits={progressSemantics.earnedHoursCountedCredits}
            color="text-[var(--accent)]"
          />
        </div>
        {progressSemantics.exclusions.length > 0 && (
          <div className="border-t border-[var(--border)] px-5 py-3">
            <p className="text-xs text-[var(--text-secondary)] mb-2">
              {progressSemantics.exclusions.length} course{progressSemantics.exclusions.length !== 1 ? "s" : ""} excluded from at least one category:
            </p>
            <div className="space-y-1">
              {progressSemantics.exclusions.slice(0, 8).map((ex) => (
                <div key={ex.courseId} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-[var(--accent)]/60 w-20 shrink-0">{ex.courseNumber}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <CountingDot active={ex.countsTowardDegree} label="deg" />
                    <CountingDot active={ex.countsTowardGPA} label="gpa" />
                    <CountingDot active={ex.countsTowardEarnedHours} label="hrs" />
                  </div>
                  <span className="text-[var(--text-secondary)] truncate">{ex.excludeReason}</span>
                </div>
              ))}
              {progressSemantics.exclusions.length > 8 && (
                <a href="/courses" className="text-[10px] text-[var(--accent)] hover:text-[var(--accent)]">
                  See all {progressSemantics.exclusions.length} in Courses →
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Grade breakdown table (completed) */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Completed Courses</h3>
          <span className="text-xs text-[var(--text-secondary)]">{completedGraded.length} graded courses</span>
        </div>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--surface-subtle)] text-[var(--text-secondary)] uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">Course</th>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-right">Cr</th>
                <th className="px-4 py-2.5 text-center">Grade</th>
                <th className="px-4 py-2.5 text-right">Pts</th>
                <th className="px-4 py-2.5 text-right">Quality Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {completedGraded.map((c) => {
                const pts = gradeToPoints(c.grade!);
                const isMajor = majorGroupIds.has(c.id);
                return (
                  <tr key={c.id} className={`hover:bg-[var(--surface-subtle)] ${isMajor ? "bg-[var(--accent-soft)]" : ""}`}>
                    <td className="px-4 py-2 font-mono text-[var(--accent)]">
                      {c.number}
                      {isMajor && (
                        <span className="ml-1.5 text-[var(--accent)] text-[9px] uppercase tracking-wider">major</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-[var(--text-secondary)] max-w-[220px] truncate">{c.name}</td>
                    <td className="px-4 py-2 text-right text-[var(--text-secondary)]">{c.credits}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`font-mono font-bold ${gradeColor(c.grade!)}`}>{c.grade}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-[var(--text-secondary)]">{pts < 0 ? "N/A" : pts.toFixed(1)}</td>
                    <td className="px-4 py-2 text-right text-[var(--text-secondary)]">
                      {pts < 0 ? "N/A" : (pts * c.credits).toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* What-If mode */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">What-if grades</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Enter hypothetical grades for planned courses to project GPA
            </p>
          </div>
          <button
            onClick={() => setWhatIfEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              whatIfEnabled ? "bg-[var(--accent)]" : "bg-[var(--text-muted)]"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                whatIfEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {activeCourses.length === 0 ? (
          <div className="px-5 py-6 text-center text-[var(--text-secondary)] text-sm">
            No planned or in-progress courses to project.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {activeCourses.map((c) => {
              const hypotheticalGrade = whatIf.get(c.id);
              const pts = hypotheticalGrade ? gradeToPoints(hypotheticalGrade) : null;
              return (
                <div
                  key={c.id}
                  className={`grid gap-3 px-5 py-3 transition-opacity sm:grid-cols-[minmax(0,1fr)_8.5rem_12rem_3rem] sm:items-center sm:gap-4 ${
                    whatIfEnabled ? "" : "opacity-40 pointer-events-none"
                  }`}
                >
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-[var(--accent)]">{c.number}</span>
                    <span className="block truncate text-xs text-[var(--text-secondary)] sm:ml-2 sm:inline">{c.name}</span>
                    <span className="ml-0 block text-xs text-[var(--text-muted)] sm:ml-2 sm:inline">{c.credits}cr</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:block">
                    <StatusPill status={c.status} />
                    <span className={`text-xs font-mono font-bold sm:hidden ${pts !== null ? gradeColor(hypotheticalGrade!) : "text-[var(--text-muted)]"}`}>
                      {pts !== null ? pts.toFixed(1) : "—"}
                    </span>
                  </div>
                  <select
                    value={hypotheticalGrade ?? ""}
                    onChange={(e) => {
                      const newMap = new Map(whatIf);
                      if (e.target.value) {
                        newMap.set(c.id, e.target.value);
                      } else {
                        newMap.delete(c.id);
                      }
                      setWhatIf(newMap);
                    }}
                    className="w-full px-2.5 py-1.5 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">— pick grade —</option>
                    {GRADE_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g} ({GRADE_SCALE[g]?.toFixed(1)})
                      </option>
                    ))}
                  </select>
                  <span className={`hidden text-right text-xs font-mono font-bold sm:block ${pts !== null ? gradeColor(hypotheticalGrade!) : "text-[var(--text-muted)]"}`}>
                    {pts !== null ? pts.toFixed(1) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Target grade solver */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Target Grade Solver</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            What grade do I need in course X to achieve target GPA Y?
          </p>
        </div>
        <div className="p-5 space-y-4">
          {/* GPA mode toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">Target:</span>
            <div className="flex gap-1">
              {(["cumulative", "major"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSolverMode(mode)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    solverMode === mode
                      ? "bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)]"
                      : "bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {mode === "cumulative" ? "Cumulative GPA" : "Major GPA"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-48">
              <label className="text-xs text-[var(--text-secondary)] mb-1.5 block uppercase tracking-wide">Course</label>
              <select
                value={solverCourse}
                onChange={(e) => setSolverCourse(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">Select a course…</option>
                {activeCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.number} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-40">
              <label className="text-xs text-[var(--text-secondary)] mb-1.5 block uppercase tracking-wide">Target GPA</label>
              <input
                type="number"
                min="0"
                max="4"
                step="0.01"
                value={solverTargetGPA}
                onChange={(e) => setSolverTargetGPA(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                placeholder="3.00"
              />
            </div>
          </div>

          {solverResult && (
            <div
              className={`rounded-xl p-4 border ${
                solverResult.grade === null
                  ? "bg-rose-50 border-rose-200"
                  : "bg-[var(--accent-soft)] border-[var(--border)]"
              }`}
            >
              {solverResult.grade === null ? (
                <p className="text-sm text-rose-700">
                  Impossible — even an A (4.0) won&apos;t reach {solverTargetGPA} GPA given your
                  current grades. You&apos;d need {solverResult.needed.toFixed(2)} grade points in
                  that course.
                </p>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className={`text-3xl font-bold ${gradeColor(solverResult.grade)}`}>
                      {solverResult.grade}
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">minimum grade</div>
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    You need at least a{" "}
                    <span className={`font-bold ${gradeColor(solverResult.grade)}`}>
                      {solverResult.grade}
                    </span>{" "}
                    in {courses.find((c) => c.id === solverCourse)?.number} to reach a{" "}
                    <span className="text-[var(--accent)] font-bold">{parseFloat(solverTargetGPA).toFixed(2)}</span>{" "}
                    {solverMode === "major" ? "major" : "cumulative"} GPA.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GPACard({
  label,
  gpa,
  base,
  changed,
  credits,
  sub,
  officialDiff,
  variant = "neutral",
}: {
  label: string;
  gpa: number;
  base: number;
  changed: boolean;
  credits: number;
  sub?: string;
  officialDiff?: number | null;
  variant?: "official" | "calculated" | "major" | "neutral";
}) {
  const delta = gpa - base;

  const containerClass =
    variant === "official"    ? "bg-[var(--accent-soft)] border-[var(--accent)]/30" :
    variant === "major"       ? "bg-purple-50 border-purple-200" :
    variant === "calculated"  ? `bg-[var(--surface)] border-l-4 ${gpa >= 3.0 ? "border-l-green-500" : gpa >= 2.0 ? "border-l-amber-500" : "border-l-rose-500"} border-[var(--border)]` :
    "bg-[var(--surface)] border-[var(--border)]";

  const gpaColor =
    gpa >= 3.5 ? "text-green-700" :
    gpa >= 3.0 ? "text-[var(--accent)]" :
    gpa >= 2.0 ? "text-amber-700" :
    "text-rose-600";

  return (
    <div className={`rounded-xl border p-5 ${containerClass}`}>
      <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wider mb-2">{label}</div>
      <div className="flex items-end gap-3">
        <div className={`text-4xl font-bold ${gpaColor}`}>
          {gpa > 0 ? gpa.toFixed(3) : "—"}
        </div>
        {changed && (
          <div className={`text-sm font-medium mb-1 ${delta > 0 ? "text-green-700" : "text-rose-600"}`}>
            {delta > 0 ? "+" : ""}{delta.toFixed(3)}
          </div>
        )}
      </div>
      <div className="text-xs text-[var(--text-muted)] mt-1">
        {credits} graded credits{sub ? ` · ${sub}` : ""}
      </div>
      {officialDiff != null && (
        <div className="text-[10px] text-[var(--text-secondary)] mt-1.5">
          Differs from official by{" "}
          <span className={officialDiff > 0 ? "text-green-700" : "text-rose-600"}>
            {officialDiff > 0 ? "+" : ""}{officialDiff.toFixed(3)}
          </span>
          {" "}(repeats/exclusions not counted)
        </div>
      )}
    </div>
  );
}

function CountingBucketCard({
  label,
  courses,
  credits,
  color,
}: {
  label: string;
  courses: number;
  credits: number;
  color: string;
}) {
  const bgClass =
    label === "Degree Progress" ? "bg-green-50" :
    label === "GPA Calculation" ? "bg-[var(--accent-soft)]" :
    "bg-violet-50";

  return (
    <div className={`${bgClass} px-4 py-3`}>
      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{credits}<span className="text-xs font-normal text-[var(--text-secondary)] ml-1">cr</span></div>
      <div className="text-[10px] text-[var(--text-muted)]">{courses} courses</div>
    </div>
  );
}

function CountingDot({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded border ${
        active
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-rose-50 text-rose-600/60 border-rose-200 line-through"
      }`}
    >
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    in_progress: "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--border)]",
    registered:  "bg-[var(--badge-registered-bg)] text-[var(--badge-registered-text)] border-[var(--badge-registered-border)]",
    planned:     "bg-[var(--badge-planned-bg)] text-[var(--badge-planned-text)] border-[var(--badge-planned-border)]",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] border ${styles[status] ?? ""} uppercase tracking-wider shrink-0`}>
      {status.replace("_", " ")}
    </span>
  );
}
