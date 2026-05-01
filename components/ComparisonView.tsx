"use client";

import type {
  PlanComparison,
  PlanComparisonPlanSummary,
  SemesterDiff,
  RequirementDiff,
  PrereqRiskDiff,
  CourseDiffs,
  ComparisonSummary,
  RiskLevel,
} from "@/lib/plan-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCourseId(id: string): string {
  return id.replace("-", "\u00A0");
}

function formatSemester(id: string): string {
  const season = id.slice(0, 2);
  const year = "20" + id.slice(2);
  const names: Record<string, string> = { FA: "Fall", SP: "Spring", SU: "Summer" };
  return `${names[season] ?? season} ${year}`;
}

function delta(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${n}`;
  return "0";
}

function deltaColor(n: number): string {
  if (n > 0) return "text-green-400";
  if (n < 0) return "text-red-400";
  return "text-[#6a6a8a]";
}

function riskBadge(level: RiskLevel): React.ReactElement {
  const styles: Record<RiskLevel, string> = {
    ok: "bg-green-500/15 text-green-400 border-green-500/30",
    warning: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    blocked: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs rounded border ${styles[level]}`}
    >
      {level}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Plan Header Cards
// ---------------------------------------------------------------------------

function PlanHeader({
  plan,
  label,
}: {
  plan: PlanComparisonPlanSummary;
  label: string;
}) {
  return (
    <div className="bg-[#12121e] border border-[#1e1e2e] rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-[#6a6a8a]">
          {label}
        </span>
      </div>
      <h3 className="text-lg font-semibold text-[#e0e0f0] mb-1">{plan.name}</h3>
      <p className="text-sm text-[#6a6a8a] mb-4">{plan.description}</p>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total Credits" value={plan.totalCredits} />
        <Stat label="Courses" value={plan.totalCourses} />
        <Stat label="Semesters" value={plan.semesterCount} />
        <Stat label="Max Sem. Credits" value={plan.maxSemesterCredits} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-[#4a4a6a] mb-0.5">{label}</div>
      <div className="text-base font-semibold text-[#d4a843]">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary Bar
// ---------------------------------------------------------------------------

function SummaryBar({ summary }: { summary: ComparisonSummary }) {
  return (
    <div className="bg-[#12121e] border border-[#1e1e2e] rounded-lg p-5">
      <h3 className="text-sm font-bold uppercase tracking-wider text-[#6a6a8a] mb-4">
        Comparison Overview
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat
          label="Courses only in Plan A"
          value={summary.coursesOnlyInACount}
        />
        <MiniStat
          label="Courses only in Plan B"
          value={summary.coursesOnlyInBCount}
        />
        <MiniStat label="Courses moved" value={summary.movedCourseCount} />
        <MiniStat
          label="Semesters with changes"
          value={summary.semestersWithChanges}
        />
        <MiniStat
          label="Credit diff"
          value={`${summary.totalCreditsA} vs ${summary.totalCreditsB}`}
          raw
        />
        <MiniStat
          label="Prereq risks introduced"
          value={summary.prereqRisksAddedInB}
          warn={summary.prereqRisksAddedInB > 0}
        />
        <MiniStat
          label="Prereq risks resolved"
          value={summary.prereqRisksRemovedInB}
        />
        <MiniStat
          label="Max sem. credits"
          value={`${summary.maxSemesterCreditsA} vs ${summary.maxSemesterCreditsB}`}
          raw
        />
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  warn,
  raw,
}: {
  label: string;
  value: number | string;
  warn?: boolean;
  raw?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-[#4a4a6a] mb-0.5">{label}</div>
      <div
        className={`text-sm font-semibold ${warn ? "text-red-400" : "text-[#d0d0e8]"}`}
      >
        {raw ? value : value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Semester Credit Deltas
// ---------------------------------------------------------------------------

function SemesterCreditsSection({ diffs }: { diffs: SemesterDiff[] }) {
  return (
    <section>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[#6a6a8a] mb-3">
        Semester Credit Comparison
      </h3>
      <div className="bg-[#12121e] border border-[#1e1e2e] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e] text-[#6a6a8a]">
              <th className="text-left px-4 py-3 font-medium">Semester</th>
              <th className="text-right px-4 py-3 font-medium">Plan A</th>
              <th className="text-right px-4 py-3 font-medium">Plan B</th>
              <th className="text-right px-4 py-3 font-medium">Delta</th>
              <th className="text-left px-4 py-3 font-medium">Course Changes</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d) => (
              <tr
                key={d.semesterId}
                className="border-b border-[#1e1e2e]/60 hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3 text-[#d0d0e8] font-medium">
                  {formatSemester(d.semesterId)}
                </td>
                <td className="px-4 py-3 text-right text-[#d0d0e8]">
                  {d.creditsA} cr
                </td>
                <td className="px-4 py-3 text-right text-[#d0d0e8]">
                  {d.creditsB} cr
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${deltaColor(d.creditDelta)}`}
                >
                  {delta(d.creditDelta)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {d.coursesOnlyInA.map((c) => (
                      <span
                        key={c}
                        className="inline-block px-1.5 py-0.5 text-xs rounded bg-red-500/10 text-red-400 border border-red-500/20"
                        title="Only in Plan A"
                      >
                        −{formatCourseId(c)}
                      </span>
                    ))}
                    {d.coursesOnlyInB.map((c) => (
                      <span
                        key={c}
                        className="inline-block px-1.5 py-0.5 text-xs rounded bg-green-500/10 text-green-400 border border-green-500/20"
                        title="Only in Plan B"
                      >
                        +{formatCourseId(c)}
                      </span>
                    ))}
                    {d.coursesOnlyInA.length === 0 &&
                      d.coursesOnlyInB.length === 0 && (
                        <span className="text-xs text-[#4a4a6a]">
                          No changes
                        </span>
                      )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Course Diffs
// ---------------------------------------------------------------------------

function CourseDiffsSection({ diffs }: { diffs: CourseDiffs }) {
  const hasDiffs =
    diffs.onlyInA.length > 0 ||
    diffs.onlyInB.length > 0 ||
    diffs.moved.length > 0;

  if (!hasDiffs) {
    return (
      <section>
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#6a6a8a] mb-3">
          Course Differences
        </h3>
        <p className="text-sm text-[#4a4a6a]">Plans contain identical courses.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[#6a6a8a] mb-3">
        Course Differences
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Only in A */}
        <div className="bg-[#12121e] border border-[#1e1e2e] rounded-lg p-4">
          <h4 className="text-xs font-semibold text-[#6a6a8a] uppercase tracking-wider mb-3">
            Only in Plan A
          </h4>
          {diffs.onlyInA.length === 0 ? (
            <p className="text-xs text-[#4a4a6a]">None</p>
          ) : (
            <ul className="space-y-1.5">
              {diffs.onlyInA.map((c) => (
                <li
                  key={c}
                  className="text-sm text-red-400 font-medium"
                >
                  {formatCourseId(c)}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Only in B */}
        <div className="bg-[#12121e] border border-[#1e1e2e] rounded-lg p-4">
          <h4 className="text-xs font-semibold text-[#6a6a8a] uppercase tracking-wider mb-3">
            Only in Plan B
          </h4>
          {diffs.onlyInB.length === 0 ? (
            <p className="text-xs text-[#4a4a6a]">None</p>
          ) : (
            <ul className="space-y-1.5">
              {diffs.onlyInB.map((c) => (
                <li
                  key={c}
                  className="text-sm text-green-400 font-medium"
                >
                  {formatCourseId(c)}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Moved */}
        <div className="bg-[#12121e] border border-[#1e1e2e] rounded-lg p-4">
          <h4 className="text-xs font-semibold text-[#6a6a8a] uppercase tracking-wider mb-3">
            Moved Between Semesters
          </h4>
          {diffs.moved.length === 0 ? (
            <p className="text-xs text-[#4a4a6a]">None</p>
          ) : (
            <ul className="space-y-2">
              {diffs.moved.map((m) => (
                <li key={m.courseId} className="text-sm">
                  <span className="text-[#d0d0e8] font-medium">
                    {formatCourseId(m.courseId)}
                  </span>
                  <div className="text-xs text-[#6a6a8a] mt-0.5">
                    {formatSemester(m.fromSemester)} →{" "}
                    {formatSemester(m.toSemester)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Requirement Coverage Deltas
// ---------------------------------------------------------------------------

function RequirementDiffsSection({ diffs }: { diffs: RequirementDiff[] }) {
  if (diffs.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#6a6a8a] mb-3">
          Requirement Coverage
        </h3>
        <p className="text-sm text-[#4a4a6a]">No requirement data available.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[#6a6a8a] mb-3">
        Requirement Coverage
      </h3>
      <p className="text-xs text-[#4a4a6a] mb-3">
        Coverage counts include completed, in-progress, and planned courses.
        Counts may exceed required totals for elective groups. Differences
        reflect plan composition, not plan quality.
      </p>
      <div className="bg-[#12121e] border border-[#1e1e2e] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e] text-[#6a6a8a]">
              <th className="text-left px-4 py-3 font-medium">Requirement</th>
              <th className="text-right px-4 py-3 font-medium">Plan A</th>
              <th className="text-right px-4 py-3 font-medium">Plan B</th>
              <th className="text-right px-4 py-3 font-medium">Required</th>
              <th className="text-right px-4 py-3 font-medium">Delta</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d) => (
              <tr
                key={d.groupId}
                className="border-b border-[#1e1e2e]/60 hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3 text-[#d0d0e8]">{d.groupName}</td>
                <td className="px-4 py-3 text-right text-[#d0d0e8]">
                  {d.coveredA} / {d.total}
                </td>
                <td className="px-4 py-3 text-right text-[#d0d0e8]">
                  {d.coveredB} / {d.total}
                </td>
                <td className="px-4 py-3 text-right text-[#6a6a8a]">
                  {d.total}
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${deltaColor(d.coverageDelta)}`}
                >
                  {delta(d.coverageDelta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Prereq Risk Deltas
// ---------------------------------------------------------------------------

function PrereqRiskSection({ diffs }: { diffs: PrereqRiskDiff[] }) {
  if (diffs.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#6a6a8a] mb-3">
          Prerequisite Risk Comparison
        </h3>
        <p className="text-sm text-[#4a4a6a]">
          No prerequisite risk differences between plans.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[#6a6a8a] mb-3">
        Prerequisite Risk Comparison
      </h3>
      <div className="bg-[#12121e] border border-[#1e1e2e] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e] text-[#6a6a8a]">
              <th className="text-left px-4 py-3 font-medium">Course</th>
              <th className="text-left px-4 py-3 font-medium">
                Semester (A / B)
              </th>
              <th className="text-center px-4 py-3 font-medium">
                Risk in Plan A
              </th>
              <th className="text-center px-4 py-3 font-medium">
                Risk in Plan B
              </th>
              <th className="text-left px-4 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d) => (
              <tr
                key={d.courseId}
                className="border-b border-[#1e1e2e]/60 hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3 text-[#d0d0e8] font-medium">
                  {formatCourseId(d.courseId)}
                </td>
                <td className="px-4 py-3 text-[#6a6a8a] text-xs">
                  {d.semesterA ? formatSemester(d.semesterA) : "—"} /{" "}
                  {d.semesterB ? formatSemester(d.semesterB) : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  {riskBadge(d.riskInA)}
                </td>
                <td className="px-4 py-3 text-center">
                  {riskBadge(d.riskInB)}
                </td>
                <td className="px-4 py-3 text-xs text-[#6a6a8a]">
                  {d.reason ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main Comparison View
// ---------------------------------------------------------------------------

export default function ComparisonView({
  comparison,
}: {
  comparison: PlanComparison;
}) {
  return (
    <div className="space-y-8">
      {/* Plan Headers - Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlanHeader plan={comparison.planA} label="Plan A" />
        <PlanHeader plan={comparison.planB} label="Plan B" />
      </div>

      {/* Summary Bar */}
      <SummaryBar summary={comparison.summary} />

      {/* Semester Credits */}
      <SemesterCreditsSection diffs={comparison.semesterDiffs} />

      {/* Course Diffs */}
      <CourseDiffsSection diffs={comparison.courseDiffs} />

      {/* Requirement Coverage */}
      <RequirementDiffsSection diffs={comparison.requirementDiffs} />

      {/* Prereq Risks */}
      <PrereqRiskSection diffs={comparison.prereqRiskDiffs} />
    </div>
  );
}
