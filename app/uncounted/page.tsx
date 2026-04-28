"use client";

import { useState, useEffect, useMemo } from "react";
import type { Course } from "@/lib/types";

const GRADE_POINTS: Record<string, number> = {
  A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7, "D+": 1.3, D: 1.0, "D-": 0.7, F: 0.0,
};

function gradeColor(grade: string): string {
  const p = GRADE_POINTS[grade] ?? -1;
  if (p >= 3.7) return "text-green-400";
  if (p >= 2.7) return "text-indigo-400";
  if (p >= 1.7) return "text-yellow-400";
  if (p >= 0) return "text-red-400";
  return "text-[#6a6a8a]";
}

export default function UncountedCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.json())
      .then((c) => { setCourses(Array.isArray(c) ? c : []); setLoading(false); })
      .catch((err) => { setError(String(err)); setLoading(false); });
  }, []);

  const uncounted = useMemo(
    () => courses.filter((c) => c.countedTowardDegree === false),
    [courses]
  );

  const counted = useMemo(
    () => courses.filter((c) => c.countedTowardDegree !== false),
    [courses]
  );

  // Group uncounted by reason
  const grouped = useMemo(() => {
    const map = new Map<string, Course[]>();
    for (const c of uncounted) {
      const reason = c.excludeReason ?? "Other";
      if (!map.has(reason)) map.set(reason, []);
      map.get(reason)!.push(c);
    }
    return Array.from(map.entries());
  }, [uncounted]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-[#6a6a8a]">Loading…</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center min-h-screen text-red-400 text-sm p-8">Failed to load: {error}</div>;
  }

  const totalCreditsUncounted = uncounted.reduce((sum, c) => sum + c.credits, 0);

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#d0d0e8]">Uncounted Courses</h2>
        <p className="text-[#6a6a8a] text-sm mt-1">
          Courses from your audit that don&apos;t count toward your degree.
          Grade replacements, superseded attempts, and excluded courses appear here.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#111120] border border-[#1e1e34] rounded-xl px-5 py-4">
          <p className="text-xs text-[#6a6a8a] uppercase tracking-wider">Total Courses Parsed</p>
          <p className="text-2xl font-bold text-[#d0d0e8] mt-1">{courses.length}</p>
        </div>
        <div className="bg-[#111120] border border-[#1e1e34] rounded-xl px-5 py-4">
          <p className="text-xs text-[#6a6a8a] uppercase tracking-wider">Counted Toward Degree</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{counted.length}</p>
        </div>
        <div className="bg-[#111120] border border-[#1e1e34] rounded-xl px-5 py-4">
          <p className="text-xs text-[#6a6a8a] uppercase tracking-wider">Not Counted</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{uncounted.length}</p>
          <p className="text-xs text-[#4a4a6a] mt-0.5">{totalCreditsUncounted} credits</p>
        </div>
      </div>

      {uncounted.length === 0 ? (
        <div className="bg-[#111120] border border-[#1e1e34] rounded-xl px-5 py-10 text-center">
          <p className="text-[#6a6a8a]">No uncounted courses found.</p>
          <p className="text-xs text-[#4a4a6a] mt-1">
            Upload a degree audit to see courses that were parsed but don&apos;t count toward your degree.
          </p>
        </div>
      ) : (
        grouped.map(([reason, groupCourses]) => (
          <section key={reason} className="bg-[#111120] border border-[#1e1e34] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#1e1e34] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#d0d0e8]">{reason}</h3>
                <p className="text-xs text-[#4a4a6a] mt-0.5">{groupCourses.length} course{groupCourses.length !== 1 ? "s" : ""}</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] border bg-red-500/10 text-red-400 border-red-500/20 uppercase tracking-wider">
                excluded
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-[#1a1a2e] text-[#6a6a8a] text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">Course</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-right">Credits</th>
                  <th className="px-4 py-2 text-center">Grade</th>
                  <th className="px-4 py-2 text-left">Semester</th>
                  <th className="px-4 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1a2e]">
                {groupCourses.map((course) => (
                  <tr key={course.id} className="text-[#8888a8]">
                    <td className="px-4 py-2.5 font-mono text-indigo-300/60 text-xs">{course.number}</td>
                    <td className="px-4 py-2.5 text-[#8888a8]/80 max-w-[200px] truncate">{course.name || <span className="italic text-[#4a4a6a]">unnamed</span>}</td>
                    <td className="px-4 py-2.5 text-right text-xs">{course.credits}</td>
                    <td className="px-4 py-2.5 text-center">
                      {course.grade ? (
                        <span className={`font-mono text-xs font-bold ${gradeColor(course.grade)} opacity-60`}>{course.grade}</span>
                      ) : (
                        <span className="text-[#3a3a5a]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono">{course.semester ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-[#6a6a8a] max-w-[200px] truncate">{course.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}
