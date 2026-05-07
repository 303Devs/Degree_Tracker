"use client";

import React, { useState, useEffect, useMemo } from "react";
import type { Course, RequirementGroup, PrereqRule } from "@/lib/types";
import { isRuleSatisfied, collectCourseIds, NON_DEGREE_CREDIT_GRADES } from "@/lib/prereqs";
import { getCourseLibraryMeta, isCourseLibraryVisible } from "@/lib/course-library";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  registered: 1,
  completed: 2,
  planned: 3,
  not_started: 4,
};

function isJunkCourse(id: string): boolean {
  return id.endsWith("-0000");
}
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

function formatId(id: string): string {
  return id.replaceAll("-", " ");
}

// ---------------------------------------------------------------------------
// Prereq tree (recursive)
// ---------------------------------------------------------------------------

function PrereqNode({
  rule,
  courses,
  depth = 0,
}: {
  rule: PrereqRule;
  courses: Course[];
  depth?: number;
}) {
  if (rule.type === "course") {
    const c = courses.find((x) => x.id === rule.courseId);
    // W/NR/IP completed courses don't earn degree credit — show as not_started
    const effectiveStatus =
      c && c.status === "completed" && c.grade && NON_DEGREE_CREDIT_GRADES.has(c.grade)
        ? "not_started"
        : c?.status;
    const statusDot: Record<string, string> = {
      completed: "bg-green-500",
      in_progress: "bg-[#d4a843]",
      registered: "bg-blue-400",
      planned: "bg-indigo-500",
      not_started: "bg-[#2a2a3a]",
    };
    return (
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            effectiveStatus ? statusDot[effectiveStatus] : "bg-[#2a2a3a]"
          }`}
        />
        <span className="font-mono text-indigo-300">{formatId(rule.courseId)}</span>
        {c && <span className="text-[#6a6a8a] truncate">{c.name}</span>}
        {!c && <span className="text-[#3a3a5a] italic">unknown</span>}
      </div>
    );
  }

  const label = rule.type === "and" ? "ALL OF" : "ONE OF";
  const labelColor = rule.type === "and" ? "text-[#d4a843]" : "text-indigo-400";

  return (
    <div className="space-y-1">
      <span className={`text-[9px] uppercase tracking-widest font-semibold ${labelColor}`}>
        {label}
      </span>
      <div className="pl-3 border-l border-[#2a2a3a] space-y-1.5">
        {rule.rules.map((r, i) => (
          <PrereqNode key={i} rule={r} courses={courses} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unlocked courses (reverse deps)
// ---------------------------------------------------------------------------

function UnlockedBy({ courseId, courses }: { courseId: string; courses: Course[] }) {
  const unlocked = useMemo(
    () =>
      courses.filter((c) => {
        if (!c.prereqs) return false;
        return collectCourseIds(c.prereqs).includes(courseId);
      }),
    [courseId, courses]
  );

  if (unlocked.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] text-[#6a6a8a] uppercase tracking-wider mb-1.5">Unlocks</p>
      <div className="flex flex-wrap gap-1.5">
        {unlocked.map((c) => (
          <span
            key={c.id}
            className="px-2 py-0.5 bg-[#d4a843]/10 text-[#d4a843] border border-[#d4a843]/20 rounded text-[10px] font-mono"
          >
            {c.number}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-500/10 text-green-400 border-green-500/20",
    in_progress: "bg-[#d4a843]/10 text-[#d4a843] border-[#d4a843]/20",
    registered: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    planned: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    not_started: "bg-[#1e1e34] text-[#6a6a8a] border-[#2a2a3a]",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] border ${styles[status] ?? styles.not_started} uppercase tracking-wider`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Expanded course detail
// ---------------------------------------------------------------------------

function CourseDetail({
  course,
  groups,
  allCourses,
}: {
  course: Course;
  groups: RequirementGroup[];
  allCourses: Course[];
}) {
  // Check if prereqs satisfied
  // Exclude W/NR/IP — only degree-credit completions satisfy prereqs
  const completedIds = new Set(
    allCourses
      .filter((c) => c.status === "completed" && !(c.grade && NON_DEGREE_CREDIT_GRADES.has(c.grade)))
      .map((c) => c.id)
  );
  const prereqSatisfied = !course.prereqs || isRuleSatisfied(course.prereqs, completedIds);

  return (
    <div className="py-3 px-2 grid grid-cols-2 gap-6">
      {/* Left: Satisfies + status info */}
      <div className="space-y-4">
        {groups.length > 0 && (
          <div>
            <p className="text-[10px] text-[#6a6a8a] uppercase tracking-wider mb-1.5">Satisfies</p>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => (
                <span
                  key={g.id}
                  className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded text-[10px]"
                >
                  {g.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {(course.description || course.notes) && (
          <div>
            <p className="text-[10px] text-[#6a6a8a] uppercase tracking-wider mb-1">
              {course.description ? "Catalog Description" : "Notes"}
            </p>
            <p className="text-xs text-[#8888a8]">{course.description ?? course.notes}</p>
          </div>
        )}

        {course.gradePoints !== undefined && (
          <div className="text-xs text-[#6a6a8a]">
            Grade points: <span className="text-[#d0d0e8]">{course.gradePoints?.toFixed(1)}</span>
            {" \u00b7 "}
            Quality points:{" "}
            <span className="text-[#d0d0e8]">
              {(course.gradePoints * course.credits).toFixed(1)}
            </span>
          </div>
        )}

        {/* Unlocked courses */}
        <UnlockedBy courseId={course.id} courses={allCourses} />
      </div>

      {/* Right: Prereq tree */}
      <div>
        {course.prereqs ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[10px] text-[#6a6a8a] uppercase tracking-wider">Prerequisites</p>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded border ${
                  prereqSatisfied
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : "bg-red-500/10 text-red-400 border-red-500/20"
                }`}
              >
                {prereqSatisfied ? "satisfied" : "not met"}
              </span>
            </div>
            <div className="bg-[#0e0e1c] border border-[#1e1e2e] rounded-lg p-3 space-y-1.5">
              <PrereqNode rule={course.prereqs} courses={allCourses} />
            </div>
          </div>
        ) : (
          <div className="text-xs text-[#4a4a6a] italic mt-1">No prerequisites</div>
        )}

        {course.coreqs && (
          <div className="mt-4">
            <p className="text-[10px] text-[#6a6a8a] uppercase tracking-wider mb-2">Corequisites</p>
            <div className="bg-[#0e0e1c] border border-[#1e1e2e] rounded-lg p-3 space-y-1.5">
              <PrereqNode rule={course.coreqs} courses={allCourses} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Filters = { search: string; status: string; category: string; source: string; counting: string };

export default function CourseLibraryWorkspace() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [requirements, setRequirements] = useState<RequirementGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ search: "", status: "", category: "", source: "", counting: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const categories = useMemo(
    () => [...new Set(requirements.map((r) => r.category))],
    [requirements]
  );

  const visibleCourses = useMemo(
    () => courses.filter((c) => isCourseLibraryVisible(c) && !isJunkCourse(c.id)),
    [courses]
  );

  const libraryStats = useMemo(() => {
    const stats = {
      Audit: 0,
      Catalog: 0,
      Manual: 0,
      Counts: 0,
      Planned: 0,
      "Not counting": 0,
      "Not planned": 0,
    };
    for (const course of visibleCourses) {
      const meta = getCourseLibraryMeta(course);
      stats[meta.source] += 1;
      stats[meta.counting] += 1;
    }
    return stats;
  }, [visibleCourses]);

  function getCourseGroups(courseId: string): RequirementGroup[] {
    return requirements.filter((r) => r.coursePool.includes(courseId));
  }

  const filtered = useMemo(
    () =>
      courses
        .filter((c) => {
          if (!isCourseLibraryVisible(c) || isJunkCourse(c.id)) return false;
          const meta = getCourseLibraryMeta(c);
          if (filters.search) {
            const q = filters.search.toLowerCase();
            if (!c.number.toLowerCase().includes(q) && !c.name.toLowerCase().includes(q) && !(c.description ?? "").toLowerCase().includes(q) && !(c.notes ?? "").toLowerCase().includes(q))
              return false;
          }
          if (filters.status && c.status !== filters.status) return false;
          if (filters.source && meta.source !== filters.source) return false;
          if (filters.counting && meta.counting !== filters.counting) return false;
          if (filters.category) {
            const groups = getCourseGroups(c.id);
            if (!groups.some((g) => g.category === filters.category)) return false;
          }
          return true;
        })
        .sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)),
    [courses, requirements, filters]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-[#6a6a8a]">Loading...</div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-400 text-sm p-8">
        Failed to load courses: {error}
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
        <p className="text-[#6a6a8a]">No courses loaded yet.</p>
        <a href="/upload" className="text-[#d4a843] hover:text-[#e8c068] text-sm">
          Upload an audit PDF &rarr;
        </a>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-5 max-w-[1200px]">
      <div className="rounded-2xl border border-[#1e1e34] bg-[#111120] p-6">
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#d4a843] font-semibold">Courses</p>
        <h2 className="text-2xl font-bold text-[#d0d0e8] mt-2">One editable course data surface</h2>
        <p className="text-[#6a6a8a] text-sm mt-2 max-w-3xl leading-relaxed">
          Catalog rows, audit rows, manual additions, uncounted attempts, planned courses, prereqs/coreqs, semester, grade,
          and counting flags are visible from the same searchable workspace.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Audit", libraryStats.Audit, "from audit"],
            ["Catalog", libraryStats.Catalog, "catalog/enriched"],
            ["Manual", libraryStats.Manual, "user-entered"],
            ["Not counting", libraryStats["Not counting"], "still visible"],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-xl border border-[#1e1e34] bg-[#0d0d1a] px-3 py-2">
              <div className="text-lg font-semibold text-[#d0d0e8]">{value}</div>
              <div className="text-[10px] uppercase tracking-wider text-[#6a6a8a]">{label}</div>
              <div className="text-[10px] text-[#4a4a6a]">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-[#1e1e34] bg-[#0d0d1a] p-3">
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search number, title, description, or notes..."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          className="flex-1 min-w-48 px-3 py-2 bg-[#111120] border border-[#1e1e34] rounded-xl text-sm text-[#d0d0e8] placeholder-[#4a4a6a] focus:outline-none focus:border-[#d4a843]/40"
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="px-3 py-2 bg-[#111120] border border-[#1e1e34] rounded-xl text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/40"
        >
          <option value="">All statuses</option>
          <option value="in_progress">In Progress</option>
          <option value="registered">Registered</option>
          <option value="completed">Completed</option>
          <option value="planned">Planned</option>
          <option value="not_started">Not Started</option>
        </select>
        <select
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
          className="px-3 py-2 bg-[#111120] border border-[#1e1e34] rounded-xl text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/40 max-w-64"
        >
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <select
          value={filters.source}
          onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}
          className="px-3 py-2 bg-[#111120] border border-[#1e1e34] rounded-xl text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/40"
        >
          <option value="">All sources</option>
          <option value="Audit">Audit</option>
          <option value="Catalog">Catalog</option>
          <option value="Manual">Manual</option>
        </select>
        <select
          value={filters.counting}
          onChange={(e) => setFilters((f) => ({ ...f, counting: e.target.value }))}
          className="px-3 py-2 bg-[#111120] border border-[#1e1e34] rounded-xl text-sm text-[#d0d0e8] focus:outline-none focus:border-[#d4a843]/40"
        >
          <option value="">All counting states</option>
          <option value="Counts">Counts</option>
          <option value="Planned">Planned</option>
          <option value="Not counting">Not counting</option>
          <option value="Not planned">Not planned</option>
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-wider">
        <span className="rounded-lg border border-green-500/20 bg-green-500/10 px-2 py-1 text-green-400">counts {libraryStats.Counts}</span>
        <span className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-indigo-300">planned {libraryStats.Planned}</span>
        <span className="rounded-lg border border-[#2a2a3a] bg-[#1e1e34] px-2 py-1 text-[#6a6a8a]">not planned {libraryStats["Not planned"]}</span>
        <span className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-300">uncounted visible {libraryStats["Not counting"]}</span>
      </div>
      </div>

      <p className="text-xs text-[#4a4a6a]">
        {filtered.length} of {visibleCourses.length} visible courses ({courses.length} loaded)
      </p>

      {/* Course table */}
      <div className="bg-[#111120] border border-[#1e1e34] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-[#1e1e34] text-[#6a6a8a] text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Course</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-right">Cr</th>
              <th className="px-4 py-3 text-center">Grade</th>
              <th className="px-4 py-3 text-left">Semester</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Source</th>
              <th className="px-4 py-3 text-left">Counting</th>
              <th className="px-4 py-3 text-center">Prereq/Coreq</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1a1a2e]">
            {filtered.map((course) => {
              const expanded = expandedId === course.id;
              const meta = getCourseLibraryMeta(course);
              return (
                <React.Fragment key={course.id}>
                  <tr
                    className={`hover:bg-white/3 cursor-pointer transition-colors ${expanded ? "bg-[#0e0e1c]" : ""}`}
                    onClick={() => setExpandedId(expanded ? null : course.id)}
                  >
                    <td className="px-4 py-3 font-mono text-indigo-300 text-xs">{course.number}</td>
                    <td className="px-4 py-3 text-[#c0c0d8] max-w-[220px] truncate">{course.name}</td>
                    <td className="px-4 py-3 text-right text-[#6a6a8a] text-xs">{course.credits}</td>
                    <td className="px-4 py-3 text-center">
                      {course.grade ? (
                        <span className={`font-mono text-xs font-bold ${gradeColor(course.grade)}`}>
                          {course.grade}
                        </span>
                      ) : (
                        <span className="text-[#3a3a5a]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#6a6a8a] text-xs font-mono">
                      {course.semester ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={course.status} />
                    </td>
                    <td className="px-4 py-3 text-[#6a6a8a] text-xs">{meta.source}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`px-2 py-0.5 rounded border ${
                        meta.counting === "Counts"
                          ? "bg-green-500/10 text-green-400 border-green-500/20"
                          : meta.counting === "Planned"
                          ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                          : "bg-[#1e1e34] text-[#6a6a8a] border-[#2a2a3a]"
                      }`}>
                        {meta.counting}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {course.prereqs || course.coreqs ? (
                        <span className="text-[10px] text-[#4a4a6a]">▶ tree</span>
                      ) : (
                        <span className="text-[10px] text-[#2a2a3a]">none</span>
                      )}
                    </td>
                  </tr>
                  {expanded && (
                    <tr key={`${course.id}-exp`}>
                      <td colSpan={9} className="bg-[#0d0d1e] border-t border-[#1a1a2e] px-6">
                        <CourseDetail
                          course={course}
                          groups={getCourseGroups(course.id)}
                          allCourses={courses}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-10 text-[#4a4a6a] text-sm">
            No courses match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
