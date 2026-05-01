/**
 * Tests for lib/progress.ts — requirement-counting semantics.
 * Verifies that users can understand why a course helps GPA but not degree
 * progress (or vice versa), and that counting semantics are consistent.
 */

import { describe, it, expect } from "vitest";
import { computeProgressSemantics, type CourseCountingSummary } from "../lib/progress";
import type { Course, RequirementGroup } from "../lib/types";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeCourse(overrides: Partial<Course> & { id: string }): Course {
  return {
    number: overrides.id.replace("-", " "),
    name: `Course ${overrides.id}`,
    credits: 3,
    prereqs: null,
    coreqs: null,
    status: "completed",
    ...overrides,
  };
}

function makeGroup(overrides: Partial<RequirementGroup> & { id: string }): RequirementGroup {
  return {
    name: overrides.id,
    category: "Test",
    type: "complete_all",
    coursePool: [],
    ...overrides,
  };
}

function findCourse(summary: ReturnType<typeof computeProgressSemantics>, id: string): CourseCountingSummary {
  const c = summary.courses.find((s) => s.courseId === id);
  if (!c) throw new Error(`Course ${id} not in summary`);
  return c;
}

// ---------------------------------------------------------------------------
// Basic counting
// ---------------------------------------------------------------------------

describe("computeProgressSemantics — basic counting", () => {
  it("normal completed course counts toward all three buckets", () => {
    const courses = [makeCourse({ id: "STAT-3100", grade: "A" })];
    const result = computeProgressSemantics(courses, []);
    const s = findCourse(result, "STAT-3100");

    expect(s.countsTowardDegree).toBe(true);
    expect(s.countsTowardGPA).toBe(true);
    expect(s.countsTowardEarnedHours).toBe(true);
    expect(s.excludeReason).toBeNull();
  });

  it("non-completed courses do not count toward GPA or earned hours by default", () => {
    const courses = [makeCourse({ id: "STAT-3100", status: "planned" })];
    const result = computeProgressSemantics(courses, []);
    const s = findCourse(result, "STAT-3100");

    expect(s.countsTowardDegree).toBe(true);
    expect(s.countsTowardGPA).toBe(false);
    expect(s.countsTowardEarnedHours).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Grade replacement / exclusion
// ---------------------------------------------------------------------------

describe("computeProgressSemantics — grade replacement", () => {
  it("course with countedTowardDegree=false shows excluded from degree", () => {
    const courses = [
      makeCourse({
        id: "MATH-1300",
        grade: "D",
        countedTowardDegree: false,
        excludeReason: "Grade replacement (>X >N)",
      }),
    ];

    const result = computeProgressSemantics(courses, []);
    const s = findCourse(result, "MATH-1300");

    expect(s.countsTowardDegree).toBe(false);
    expect(s.excludeReason).toBe("Grade replacement (>X >N)");
  });

  it("course excluded from GPA via flag", () => {
    const courses = [
      makeCourse({
        id: "MATH-1300",
        grade: "A",
        countsTowardGPA: false,
        excludeReason: "Grade replacement — superseded",
      }),
    ];

    const result = computeProgressSemantics(courses, []);
    const s = findCourse(result, "MATH-1300");

    expect(s.countsTowardGPA).toBe(false);
  });

  it("course excluded from earned hours via flag", () => {
    const courses = [
      makeCourse({
        id: "MATH-1300",
        grade: "D",
        countsTowardEarnedHours: false,
      }),
    ];

    const result = computeProgressSemantics(courses, []);
    const s = findCourse(result, "MATH-1300");

    expect(s.countsTowardEarnedHours).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Special grade handling
// ---------------------------------------------------------------------------

describe("computeProgressSemantics — special grades", () => {
  it("F grade: counts toward GPA but not earned hours", () => {
    const courses = [makeCourse({ id: "CSCI-1300", grade: "F" })];
    const result = computeProgressSemantics(courses, []);
    const s = findCourse(result, "CSCI-1300");

    expect(s.countsTowardGPA).toBe(true); // F has grade points (0.0)
    expect(s.countsTowardEarnedHours).toBe(false);
    expect(s.excludeReason).toContain("F grade");
  });

  it("W grade: does not count toward GPA, earned hours, or degree", () => {
    const courses = [makeCourse({ id: "PHYS-1110", grade: "W" })];
    const result = computeProgressSemantics(courses, []);
    const s = findCourse(result, "PHYS-1110");

    expect(s.countsTowardDegree).toBe(false);
    expect(s.countsTowardGPA).toBe(false);
    expect(s.countsTowardEarnedHours).toBe(false);
    expect(s.excludeReason).toContain("withdrawn");
  });

  it("NR grade: does not count toward GPA, earned hours, or degree", () => {
    const courses = [makeCourse({ id: "CSCI-2270", grade: "NR" })];
    const result = computeProgressSemantics(courses, []);
    const s = findCourse(result, "CSCI-2270");

    expect(s.countsTowardDegree).toBe(false);
    expect(s.countsTowardGPA).toBe(false);
    expect(s.countsTowardEarnedHours).toBe(false);
    expect(s.excludeReason).toContain("not reported");
  });

  it("IP grade: does not count toward GPA, earned hours, or degree", () => {
    const courses = [makeCourse({ id: "CSCI-3308", grade: "IP" })];
    const result = computeProgressSemantics(courses, []);
    const s = findCourse(result, "CSCI-3308");

    expect(s.countsTowardDegree).toBe(false);
    expect(s.countsTowardGPA).toBe(false);
    expect(s.countsTowardEarnedHours).toBe(false);
    expect(s.excludeReason).toContain("in progress");
  });

  it("HS grade: does not count toward GPA, still counts toward earned hours", () => {
    const courses = [makeCourse({ id: "SPAN-1010", grade: "HS" })];
    const result = computeProgressSemantics(courses, []);
    const s = findCourse(result, "SPAN-1010");

    expect(s.countsTowardGPA).toBe(false);
    expect(s.countsTowardEarnedHours).toBe(true); // HS earns credit
    expect(s.excludeReason).toContain("HS");
    expect(s.excludeReason).toContain("not included in GPA");
  });

  it("course with no grade (in_progress) is not counted for GPA", () => {
    const courses = [makeCourse({ id: "STAT-3100", status: "in_progress", grade: undefined })];
    const result = computeProgressSemantics(courses, []);
    const s = findCourse(result, "STAT-3100");

    expect(s.countsTowardGPA).toBe(false);
    expect(s.countsTowardEarnedHours).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The key scenario: why a course helps GPA but not degree (or vice versa)
// ---------------------------------------------------------------------------

describe("computeProgressSemantics — mixed counting scenarios", () => {
  it("grade replacement: old attempt counts toward GPA but not degree", () => {
    // First attempt: D in MATH-1300 — counts toward GPA (drags it down)
    // but excluded from degree progress (replaced by retake)
    const courses = [
      makeCourse({
        id: "MATH-1300-OLD",
        number: "MATH 1300",
        name: "Calculus 1",
        grade: "D",
        countedTowardDegree: false,
        countsTowardGPA: true,
        excludeReason: "Grade replacement (>X >N)",
      }),
      makeCourse({
        id: "MATH-1300",
        number: "MATH 1300",
        name: "Calculus 1",
        grade: "B+",
      }),
    ];

    const result = computeProgressSemantics(courses, []);

    const old = findCourse(result, "MATH-1300-OLD");
    expect(old.countsTowardDegree).toBe(false);
    expect(old.countsTowardGPA).toBe(true);
    expect(old.excludeReason).toBe("Grade replacement (>X >N)");

    const current = findCourse(result, "MATH-1300");
    expect(current.countsTowardDegree).toBe(true);
    expect(current.countsTowardGPA).toBe(true);
  });

  it("HS transfer: counts toward degree but not GPA", () => {
    const courses = [
      makeCourse({
        id: "SPAN-1010",
        grade: "HS",
        countedTowardDegree: undefined, // defaults to true
      }),
    ];
    const groups = [
      makeGroup({
        id: "foreign-lang",
        name: "Foreign Language",
        coursePool: ["SPAN-1010"],
      }),
    ];

    const result = computeProgressSemantics(courses, groups);
    const s = findCourse(result, "SPAN-1010");

    expect(s.countsTowardDegree).toBe(true);
    expect(s.countsTowardGPA).toBe(false);
    expect(s.requirementGroups).toContain("Foreign Language");
  });
});

// ---------------------------------------------------------------------------
// Requirement group linkage
// ---------------------------------------------------------------------------

describe("computeProgressSemantics — requirement groups", () => {
  it("maps courses to their requirement groups", () => {
    const courses = [
      makeCourse({ id: "STAT-2600", grade: "A" }),
      makeCourse({ id: "STAT-3100", grade: "B" }),
    ];
    const groups = [
      makeGroup({
        id: "stats-core",
        name: "Stats Core",
        coursePool: ["STAT-2600", "STAT-3100"],
      }),
      makeGroup({
        id: "major",
        name: "Major Requirements",
        coursePool: ["STAT-3100"],
      }),
    ];

    const result = computeProgressSemantics(courses, groups);
    const s2600 = findCourse(result, "STAT-2600");
    const s3100 = findCourse(result, "STAT-3100");

    expect(s2600.requirementGroups).toEqual(["Stats Core"]);
    expect(s3100.requirementGroups).toContain("Stats Core");
    expect(s3100.requirementGroups).toContain("Major Requirements");
  });

  it("uses selectedCourses for pick groups", () => {
    const courses = [
      makeCourse({ id: "A", grade: "A" }),
      makeCourse({ id: "B", grade: "B" }),
    ];
    const groups = [
      makeGroup({
        id: "elective",
        name: "Elective",
        type: "pick_one",
        coursePool: ["A", "B"],
        selectedCourses: ["B"],
      }),
    ];

    const result = computeProgressSemantics(courses, groups);
    const sA = findCourse(result, "A");
    const sB = findCourse(result, "B");

    // Only B is selected, so only B maps to this group
    expect(sA.requirementGroups).toEqual([]);
    expect(sB.requirementGroups).toEqual(["Elective"]);
  });
});

// ---------------------------------------------------------------------------
// Aggregate stats
// ---------------------------------------------------------------------------

describe("computeProgressSemantics — aggregates", () => {
  it("computes correct aggregate counts", () => {
    const courses = [
      makeCourse({ id: "A", grade: "A", credits: 3 }),
      makeCourse({ id: "B", grade: "B", credits: 4 }),
      makeCourse({ id: "C", grade: "F", credits: 3 }),
      makeCourse({ id: "D", grade: "HS", credits: 3 }),
      makeCourse({
        id: "E",
        grade: "D",
        credits: 3,
        countedTowardDegree: false,
        countsTowardGPA: false,
        countsTowardEarnedHours: false,
      }),
    ];

    const result = computeProgressSemantics(courses, []);

    expect(result.totalCourses).toBe(5);

    // Degree: A, B, C, D count (E excluded); D=HS counts toward degree
    expect(result.degreeCountedCourses).toBe(4);
    expect(result.degreeCountedCredits).toBe(3 + 4 + 3 + 3);

    // GPA: A, B, C count (D=HS no grade points, E excluded)
    expect(result.gpaCountedCourses).toBe(3);
    expect(result.gpaCountedCredits).toBe(3 + 4 + 3);

    // Earned hours: A, B, D (HS earns credit). C=F no earned, E excluded
    expect(result.earnedHoursCountedCourses).toBe(3);
    expect(result.earnedHoursCountedCredits).toBe(3 + 4 + 3);
  });

  it("exclusions list contains courses excluded from any bucket", () => {
    const courses = [
      makeCourse({ id: "A", grade: "A", credits: 3 }), // all good
      makeCourse({ id: "B", grade: "F", credits: 3 }), // excluded from earned hours
      makeCourse({ id: "C", grade: "HS", credits: 3 }), // excluded from GPA
    ];

    const result = computeProgressSemantics(courses, []);

    // A counts for everything — not in exclusions
    // B (F) excluded from earned hours
    // C (HS) excluded from GPA
    expect(result.exclusions).toHaveLength(2);
    expect(result.exclusions.map((e) => e.courseId).sort()).toEqual(["B", "C"]);
  });

  it("no exclusions for all-clean courses", () => {
    const courses = [
      makeCourse({ id: "A", grade: "A" }),
      makeCourse({ id: "B", grade: "B" }),
    ];

    const result = computeProgressSemantics(courses, []);
    expect(result.exclusions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("computeProgressSemantics — edge cases", () => {
  it("handles empty courses", () => {
    const result = computeProgressSemantics([], []);
    expect(result.totalCourses).toBe(0);
    expect(result.courses).toEqual([]);
    expect(result.exclusions).toEqual([]);
  });

  it("handles course not in any requirement group", () => {
    const courses = [makeCourse({ id: "ELECTIVE-1000", grade: "A" })];
    const groups = [
      makeGroup({ id: "core", name: "Core", coursePool: ["OTHER-1000"] }),
    ];

    const result = computeProgressSemantics(courses, groups);
    const s = findCourse(result, "ELECTIVE-1000");
    expect(s.requirementGroups).toEqual([]);
  });

  it("course with 0 credits still counted correctly", () => {
    const courses = [makeCourse({ id: "ZERO", grade: "A", credits: 0 })];
    const result = computeProgressSemantics(courses, []);
    const s = findCourse(result, "ZERO");

    expect(s.countsTowardDegree).toBe(true);
    expect(s.countsTowardGPA).toBe(true);
    expect(result.gpaCountedCredits).toBe(0);
  });
});
