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
  if (p < 0) return "text-[#6a6a8a]";
  if (p >= 3.7) return "text-green-400";
  if (p >= 2.7) return "text-indigo-400";
  if (p >= 1.7) return "text-yellow-400";
  return "text-red-400";
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
      <div className="flex items-center justify-center min-h-screen text-[#6a6a8a]">Loading…</div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-400 text-sm p-8">
        Failed to load GPA data: {error}
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
        <p className="text-[#6a6a8a]">No course data yet.</p>
        <a href="/upload" className="text-[#d4a843] hover:text-[#e8c068] text-sm">
          Upload an audit PDF →
        </a>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-[#d0d0e8]">GPA Calculator</h2>
        <p className="text-[#6a6a8a] text-sm mt-1">
          Actual GPA from completed courses + what-if projections for planned courses.
        </p>
      </div>

      {/* GPA Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        {officialGPA > 0 && (
          <GPACard
            label="Official GPA"
            gpa={officialGPA}
            base={officialGPA}
            changed={false}
            credits={completedGraded.reduce((a, c) => a + c.credits, 0)}
            sub="From degree audit"
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
          />
        )}
        <GPACard
          label="Calculated Major GPA"
          gpa={whatIfEnabled ? majorGPA : baseMajorGPA}
          base={baseMajorGPA}
          changed={whatIfEnabled && Math.abs(majorGPA - baseMajorGPA) > 0.001}
          credits={majorGraded.filter((c) => c.status === "completed").reduce((a, c) => a + c.credits, 0)}
          sub="Stats & DS major courses only"
        />
      </div>

      {/* Counting Semantics Summary */}
      <section className="bg-[#111120] border border-[#1e1e34] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e34]">
          <h3 className="text-sm font-semibold text-[#d0d0e8]">How Courses Count</h3>
          <p className="text-xs text-[#6a6a8a] mt-0.5">
            Not every course counts the same way. Some affect your GPA but not degree progress, or vice versa.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-px bg-[#1a1a2e]">
          <CountingBucketCard
            label="Degree Progress"
            courses={progressSemantics.degreeCountedCourses}
            credits={progressSemantics.degreeCountedCredits}
            color="text-green-400"
          />
          <CountingBucketCard
            label="GPA Calculation"
            courses={progressSemantics.gpaCountedCourses}
            credits={progressSemantics.gpaCountedCredits}
            color="text-[#d4a843]"
          />
          <CountingBucketCard
            label="Earned Hours"
            courses={progressSemantics.earnedHoursCountedCourses}
            credits={progressSemantics.earnedHoursCountedCredits}
            color="text-indigo-400"
          />
        </div>
        {progressSemantics.exclusions.length > 0 && (
          <div className="border-t border-[#1e1e34] px-5 py-3">
            <p className="text-xs text-[#6a6a8a] mb-2">
              {progressSemantics.exclusions.length} course{progressSemantics.exclusions.length !== 1 ? "s" : ""} excluded from at least one category:
            </p>
            <div className="space-y-1">
              {progressSemantics.exclusions.slice(0, 8).map((ex) => (
                <div key={ex.courseId} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-indigo-300/60 w-20 shrink-0">{ex.courseNumber}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <CountingDot active={ex.countsTowardDegree} label="deg" />
                    <CountingDot active={ex.countsTowardGPA} label="gpa" />
                    <CountingDot active={ex.countsTowardEarnedHours} label="hrs" />
                  </div>
                  <span className="text-[#6a6a8a] truncate">{ex.excludeReason}</span>
                </div>
              ))}
              {progressSemantics.exclusions.length > 8 && (
                <a href="/courses" className="text-[10px] text-[#d4a843] hover:text-[#e8c068]">
                  See all {progressSemantics.exclusions.length} in Courses →
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Grade breakdown table (completed) */}
      <section className="bg-[#111120] border border-[#1e1e34] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e34] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#d0d0e8]">Completed Courses</h3>
          <span className="text-xs text-[#6a6a8a]">{completedGraded.length} graded courses</span>
        </div>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#0f0f1e] text-[#6a6a8a] uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">Course</th>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-right">Cr</th>
                <th className="px-4 py-2.5 text-center">Grade</th>
                <th className="px-4 py-2.5 text-right">Pts</th>
                <th className="px-4 py-2.5 text-right">Quality Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a2e]">
              {completedGraded.map((c) => {
                const pts = gradeToPoints(c.grade!);
                const isMajor = majorGroupIds.has(c.id);
                return (
                  <tr key={c.id} className={`hover:bg-white/3 ${isMajor ? "bg-[#d4a843]/3" : ""}`}>
                    <td className="px-4 py-2 font-mono text-indigo-300">
                      {c.number}
                      {isMajor && (
                        <span className="ml-1.5 text-[#d4a843] text-[9px] uppercase tracking-wider">major</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-[#8888a8] max-w-[220px] truncate">{c.name}</td>
                    <td className="px-4 py-2 text-right text-[#6a6a8a]">{c.credits}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`font-mono font-bold ${gradeColor(c.grade!)}`}>{c.grade}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-[#8888a8]">{pts < 0 ? "N/A" : pts.toFixed(1)}</td>
                    <td className="px-4 py-2 text-right text-[#8888a8]">
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
      <section className="bg-[#111120] border border-[#1e1e34] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e34] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#d0d0e8]">What-If Mode</h3>
            <p className="text-xs text-[#6a6a8a] mt-0.5">
              Enter hypothetical grades for planned courses to project GPA
            </p>
          </div>
          <button
            onClick={() => setWhatIfEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              whatIfEnabled ? "bg-[#d4a843]" : "bg-[#2a2a3a]"
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
          <div className="px-5 py-6 text-center text-[#6a6a8a] text-sm">
            No planned or in-progress courses to project.
          </div>
        ) : (
          <div className="divide-y divide-[#1a1a2e]">
            {activeCourses.map((c) => {
              const hypotheticalGrade = whatIf.get(c.id);
              const pts = hypotheticalGrade ? gradeToPoints(hypotheticalGrade) : null;
              return (
                <div
                  key={c.id}
                  className={`grid grid-cols-[minmax(0,1fr)_8.5rem_12rem_3rem] items-center gap-4 px-5 py-3 transition-opacity ${
                    whatIfEnabled ? "" : "opacity-40 pointer-events-none"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs text-indigo-300">{c.number}</span>
                    <span className="text-xs text-[#8888a8] ml-2">{c.name}</span>
                    <span className="text-xs text-[#4a4a6a] ml-2">{c.credits}cr</span>
                  </div>
                  <StatusPill status={c.status} />
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
                    className="w-full px-2.5 py-1.5 bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg text-xs text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/50"
                  >
                    <option value="">— pick grade —</option>
                    {GRADE_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g} ({GRADE_SCALE[g]?.toFixed(1)})
                      </option>
                    ))}
                  </select>
                  <span className={`text-xs font-mono font-bold text-right ${pts !== null ? gradeColor(hypotheticalGrade!) : "text-[#2f2f48]"}`}>
                    {pts !== null ? pts.toFixed(1) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Target grade solver */}
      <section className="bg-[#111120] border border-[#1e1e34] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e34]">
          <h3 className="text-sm font-semibold text-[#d0d0e8]">Target Grade Solver</h3>
          <p className="text-xs text-[#6a6a8a] mt-0.5">
            What grade do I need in course X to achieve target GPA Y?
          </p>
        </div>
        <div className="p-5 space-y-4">
          {/* GPA mode toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6a6a8a] uppercase tracking-wide">Target:</span>
            <div className="flex gap-1">
              {(["cumulative", "major"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSolverMode(mode)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    solverMode === mode
                      ? "bg-[#d4a843]/15 border-[#d4a843]/30 text-[#d4a843]"
                      : "bg-[#1a1a2e] border-[#2a2a3e] text-[#6a6a8a] hover:text-[#8888a8]"
                  }`}
                >
                  {mode === "cumulative" ? "Cumulative GPA" : "Major GPA"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-48">
              <label className="text-xs text-[#6a6a8a] mb-1.5 block uppercase tracking-wide">Course</label>
              <select
                value={solverCourse}
                onChange={(e) => setSolverCourse(e.target.value)}
                className="w-full px-3 py-2 bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/50"
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
              <label className="text-xs text-[#6a6a8a] mb-1.5 block uppercase tracking-wide">Target GPA</label>
              <input
                type="number"
                min="0"
                max="4"
                step="0.01"
                value={solverTargetGPA}
                onChange={(e) => setSolverTargetGPA(e.target.value)}
                className="w-full px-3 py-2 bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/50"
                placeholder="3.00"
              />
            </div>
          </div>

          {solverResult && (
            <div
              className={`rounded-xl p-4 border ${
                solverResult.grade === null
                  ? "bg-red-500/10 border-red-500/20"
                  : "bg-[#d4a843]/10 border-[#d4a843]/20"
              }`}
            >
              {solverResult.grade === null ? (
                <p className="text-sm text-red-300">
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
                    <div className="text-[10px] text-[#6a6a8a] mt-0.5">minimum grade</div>
                  </div>
                  <div className="text-sm text-[#8888a8]">
                    You need at least a{" "}
                    <span className={`font-bold ${gradeColor(solverResult.grade)}`}>
                      {solverResult.grade}
                    </span>{" "}
                    in {courses.find((c) => c.id === solverCourse)?.number} to reach a{" "}
                    <span className="text-[#d4a843] font-bold">{parseFloat(solverTargetGPA).toFixed(2)}</span>{" "}
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
}: {
  label: string;
  gpa: number;
  base: number;
  changed: boolean;
  credits: number;
  sub?: string;
  officialDiff?: number | null;
}) {
  const delta = gpa - base;
  return (
    <div className="bg-[#111120] border border-[#1e1e34] rounded-xl p-5">
      <div className="text-xs text-[#6a6a8a] uppercase tracking-wider mb-2">{label}</div>
      <div className="flex items-end gap-3">
        <div className={`text-4xl font-bold ${gpa >= 3.5 ? "text-[#d4a843]" : gpa >= 3.0 ? "text-green-400" : gpa >= 2.0 ? "text-indigo-400" : "text-red-400"}`}>
          {gpa > 0 ? gpa.toFixed(3) : "—"}
        </div>
        {changed && (
          <div className={`text-sm font-medium mb-1 ${delta > 0 ? "text-green-400" : "text-red-400"}`}>
            {delta > 0 ? "+" : ""}{delta.toFixed(3)}
          </div>
        )}
      </div>
      <div className="text-xs text-[#4a4a6a] mt-1">
        {credits} graded credits{sub ? ` · ${sub}` : ""}
      </div>
      {officialDiff != null && (
        <div className="text-[10px] text-[#6a6a8a] mt-1.5">
          Differs from official by{" "}
          <span className={officialDiff > 0 ? "text-green-400" : "text-red-400"}>
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
  return (
    <div className="bg-[#111120] px-4 py-3">
      <div className="text-[10px] text-[#6a6a8a] uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{credits}<span className="text-xs font-normal text-[#6a6a8a] ml-1">cr</span></div>
      <div className="text-[10px] text-[#4a4a6a]">{courses} courses</div>
    </div>
  );
}

function CountingDot({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded border ${
        active
          ? "bg-green-500/10 text-green-400 border-green-500/20"
          : "bg-red-500/10 text-red-400/60 border-red-500/20 line-through"
      }`}
    >
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    in_progress: "bg-[#d4a843]/15 text-[#d4a843] border-[#d4a843]/20",
    registered: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    planned: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] border ${styles[status] ?? ""} uppercase tracking-wider shrink-0`}>
      {status.replace("_", " ")}
    </span>
  );
}
