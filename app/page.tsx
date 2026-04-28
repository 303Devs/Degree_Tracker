import Link from "next/link";
import { readAppData } from "@/lib/data";
import { gradeToPoints, calcGPA, calcProgress, isRuleSatisfied } from "@/lib/prereqs";
import ProgressBar from "@/components/ProgressBar";
import type { RequirementGroup, Course, Semester } from "@/lib/types";

export const dynamic = "force-dynamic";

function calcTotalHours(courses: Course[]) {
  const earned = courses
    .filter((c) => c.status === "completed" && c.credits > 0)
    .reduce((acc, c) => acc + c.credits, 0);
  const inProgress = courses
    .filter((c) => (c.status === "in_progress" || c.status === "registered") && c.credits > 0)
    .reduce((acc, c) => acc + c.credits, 0);
  return { earned, inProgress };
}

function groupByCategory(requirements: RequirementGroup[]): Map<string, RequirementGroup[]> {
  const map = new Map<string, RequirementGroup[]>();
  for (const g of requirements) {
    const list = map.get(g.category) ?? [];
    list.push(g);
    map.set(g.category, list);
  }
  return map;
}

export default function Dashboard() {
  const { courses, requirements, semesters, programs } = readAppData();
  const isEmpty = courses.length === 0 && requirements.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-8 p-8">
        <div className="text-center space-y-4 max-w-lg">
          {/* Icon */}
          <div className="w-20 h-20 mx-auto rounded-2xl bg-[#d4a843]/10 border border-[#d4a843]/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-[#d4a843]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[#d0d0e8]">Welcome to Degree Tracker</h2>
            <p className="text-[#6a6a8a] mt-2 leading-relaxed">
              Upload your CU degree audit PDF to get started. The parser extracts all requirement
              categories, courses, grades, and hours automatically — nothing to configure.
            </p>
          </div>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 mt-2 px-6 py-3 bg-[#d4a843] hover:bg-[#e8c068] text-[#0a0a12] rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-[#d4a843]/20"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload Audit PDF
          </Link>
          <p className="text-xs text-[#4a4a6a]">
            Get your audit from MyCUInfo → Student → Degree Audit
          </p>
        </div>
      </div>
    );
  }

  const program = programs[0];
  const calcedGPA = calcGPA(courses.filter((c) => c.status === "completed" && !!c.grade && c.grade !== "HS" && c.grade !== "W"));
  const officialGPA = program?.gpa ?? 0;
  const gpa = officialGPA > 0 ? officialGPA : calcedGPA;
  const usingOfficialGPA = officialGPA > 0;
  const { earned: totalEarned, inProgress: totalIP } = calcTotalHours(courses);
  const currentSem = semesters.find((s) => s.status === "in_progress");
  const registeredSems = semesters.filter((s) => s.status === "registered");

  // W6: deduplicate currentCourses — a course may satisfy both conditions
  const currentCourseIds = new Set<string>([
    ...courses.filter((c) => c.status === "in_progress").map((c) => c.id),
    ...(currentSem ? currentSem.courses : []),
  ]);
  const currentCourses = courses.filter((c) => currentCourseIds.has(c.id));
  const byCategory = groupByCategory(requirements);

  // W4: derive total required hours from requirements (largest minimum_hours group >= 100)
  const totalRequired =
    requirements
      .filter((g) => g.type === "minimum_hours" && (g.requiredHours ?? 0) >= 100)
      .reduce<number>((max, g) => Math.max(max, g.requiredHours ?? 0), 0) || 120;

  // W5: compute alerts — prereq conflicts and credit load warnings
  const completedIds = new Set(courses.filter((c) => c.status === "completed").map((c) => c.id));
  const alerts: string[] = [];

  // Prereq conflicts: planned/not_started courses whose prereqs aren't met
  for (const c of courses) {
    if (c.status !== "planned" && c.status !== "not_started") continue;
    if (!c.prereqs) continue;
    if (!isRuleSatisfied(c.prereqs, completedIds)) {
      alerts.push(`Prereq conflict: ${c.number} has unmet prerequisites`);
    }
  }

  // Credit load warnings per semester
  for (const sem of semesters) {
    if (sem.status !== "planned" && sem.status !== "in_progress" && sem.status !== "registered") continue;
    const semCredits = sem.courses
      .map((id) => courses.find((c) => c.id === id))
      .filter(Boolean)
      .reduce((acc, c) => acc + (c!.credits || 0), 0);
    if (semCredits > 18) {
      alerts.push(`Credit overload: ${sem.label} has ${semCredits} credits (>18)`);
    } else if (semCredits > 0 && semCredits < 12 && sem.status === "planned") {
      alerts.push(`Light load: ${sem.label} has only ${semCredits} credits (<12)`);
    }
  }

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#d0d0e8]">Dashboard</h2>
          {program && (
            <p className="text-[#6a6a8a] text-sm mt-1">
              {program.degreeName} &mdash; Catalog {program.catalogYear}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-[#d4a843]">{gpa > 0 ? gpa.toFixed(3) : "—"}</div>
          <div className="text-xs text-[#6a6a8a] mt-0.5">{usingOfficialGPA ? "Official GPA" : "Cumulative GPA"}</div>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Hours Earned" value={totalEarned.toString()} sub={`of ${totalRequired} required`} accent />
        <StatCard label="In Progress" value={totalIP.toString()} sub="hours this semester" />
        <StatCard
          label="Completion"
          value={`${Math.round((totalEarned / totalRequired) * 100)}%`}
          sub="overall progress"
        />
        <StatCard
          label="Remaining"
          value={Math.max(0, totalRequired - totalEarned - totalIP).toString()}
          sub="hours to graduate"
        />
      </div>

      {/* Alerts panel */}
      {alerts.length > 0 && (
        <section className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">Alerts</h3>
          <ul className="space-y-1">
            {alerts.map((msg, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-amber-300/80">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                {msg}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Current semester */}
      {currentSem && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-[#d4a843] animate-pulse" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6a6a8a]">
              {currentSem.label} — In Progress
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentCourses.map((c) => (
              <div
                key={c.id}
                className="px-3 py-2.5 bg-[#111120] border border-[#1e1e34] rounded-xl text-sm hover:border-[#d4a843]/20 transition-colors"
              >
                <span className="font-mono text-indigo-300 text-xs">{c.number}</span>
                <span className="text-[#6a6a8a] ml-2 text-xs">{c.credits}cr</span>
                <div className="text-xs text-[#8888a8] mt-0.5">{c.name}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming registered semesters */}
      {registeredSems.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6a6a8a]">
              Upcoming — Registered
            </h3>
          </div>
          <div className="space-y-3">
            {registeredSems.map((sem) => {
              const semCourses = courses.filter((c) => sem.courses.includes(c.id));
              return (
                <div key={sem.id}>
                  <p className="text-[10px] text-indigo-400/70 uppercase tracking-wider mb-1.5">{sem.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {semCourses.map((c) => (
                      <div
                        key={c.id}
                        className="px-3 py-2.5 bg-[#111120] border border-indigo-500/15 rounded-xl text-sm hover:border-indigo-500/30 transition-colors"
                      >
                        <span className="font-mono text-indigo-300 text-xs">{c.number}</span>
                        <span className="text-[#6a6a8a] ml-2 text-xs">{c.credits}cr</span>
                        <div className="text-xs text-[#8888a8] mt-0.5">{c.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Progress by category */}
      <section className="space-y-6">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6a6a8a]">
          Requirement Progress
        </h3>
        {Array.from(byCategory.entries()).map(([category, groups]) => {
          const minHrsGroups = groups.filter((g) => g.type === "minimum_hours");
          const otherGroups = groups.filter((g) => g.type !== "minimum_hours");

          return (
            <div key={category} className="space-y-3">
              <h4 className="text-xs font-semibold text-[#8888a8] border-b border-[#1e1e34] pb-1.5 uppercase tracking-wide">
                {category}
              </h4>
              {otherGroups.map((g) => {
                const prog = calcProgress(g, courses);
                return (
                  <ProgressBar
                    key={g.id}
                    label={g.name}
                    completed={prog.completed}
                    inProgress={prog.inProgress}
                    total={prog.total}
                    unit="courses"
                  />
                );
              })}
              {minHrsGroups.map((g) => {
                const prog = calcProgress(g, courses);
                return (
                  <ProgressBar
                    key={g.id}
                    label={g.name}
                    completed={prog.completed}
                    total={prog.total}
                    unit="hours"
                  />
                );
              })}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className={`bg-[#111120] border rounded-xl p-4 ${accent ? "border-[#d4a843]/20" : "border-[#1e1e34]"}`}>
      <div className="text-[#6a6a8a] text-[10px] uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-[#d4a843]" : "text-[#d0d0e8]"}`}>{value}</div>
      <div className="text-[10px] text-[#4a4a6a] mt-0.5">{sub}</div>
    </div>
  );
}
