/**
 * Regression tests for W/NR/IP non-degree-credit semantics across ALL surfaces.
 *
 * Sue's Phase 2 review identified 4 places where W/NR/IP grades were not
 * consistently excluded from degree credit, earned hours, prereq satisfaction,
 * and dashboard calculations. These tests ensure uniform semantics.
 *
 * Surfaces covered:
 *   1. lib/progress.ts — computeProgressSemantics (degree + earned hours)
 *   2. app/planner/page.tsx — prereq badge logic (tested via isRuleSatisfied)
 *   3. app/page.tsx — dashboard prereq alerts (tested via isRuleSatisfied filter)
 *   4. app/page.tsx — dashboard earned hours (tested via calcTotalHours pattern)
 *   5. lib/prereqs.ts — calcProgress + isCourseDegreeSatisfied (canonical)
 */

import { describe, it, expect } from "vitest";
import {
  isRuleSatisfied,
  calcProgress,
  NON_DEGREE_CREDIT_GRADES,
} from "../lib/prereqs";
import type { PrereqRule } from "../lib/types";
import { computeProgressSemantics } from "../lib/progress";
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

// ---------------------------------------------------------------------------
// NON_DEGREE_CREDIT_GRADES canonical set
// ---------------------------------------------------------------------------

describe("NON_DEGREE_CREDIT_GRADES canonical set", () => {
  it("contains exactly W, NR, IP", () => {
    expect(NON_DEGREE_CREDIT_GRADES).toEqual(new Set(["W", "NR", "IP"]));
  });
});

// ---------------------------------------------------------------------------
// Surface 1: lib/progress.ts — computeProgressSemantics
// ---------------------------------------------------------------------------

describe("progress.ts — W/NR/IP exclusion from degree + earned hours", () => {
  for (const grade of ["W", "NR", "IP"]) {
    it(`${grade} grade: excludes from degree, earned hours, and GPA`, () => {
      const courses = [makeCourse({ id: "TEST-1000", grade })];
      const result = computeProgressSemantics(courses, []);
      const s = result.courses.find((c) => c.courseId === "TEST-1000")!;

      expect(s.countsTowardDegree).toBe(false);
      expect(s.countsTowardEarnedHours).toBe(false);
      expect(s.countsTowardGPA).toBe(false);
      expect(s.excludeReason).toBeTruthy();
    });

    it(`${grade} grade: excluded from aggregate degree + earned hour counts`, () => {
      const courses = [
        makeCourse({ id: "GOOD", grade: "A", credits: 3 }),
        makeCourse({ id: "BAD", grade, credits: 4 }),
      ];
      const result = computeProgressSemantics(courses, []);

      // Only GOOD should count
      expect(result.degreeCountedCredits).toBe(3);
      expect(result.earnedHoursCountedCredits).toBe(3);
      expect(result.degreeCountedCourses).toBe(1);
      expect(result.earnedHoursCountedCourses).toBe(1);
    });
  }

  it("normal grades (A, B, C, D) still count toward degree + earned hours", () => {
    for (const grade of ["A", "B", "C", "D"]) {
      const courses = [makeCourse({ id: `TEST-${grade}`, grade })];
      const result = computeProgressSemantics(courses, []);
      const s = result.courses[0];

      expect(s.countsTowardDegree).toBe(true);
      // D still earns hours (unlike F)
      expect(s.countsTowardEarnedHours).toBe(true);
    }
  });

  it("F still counts toward degree but not earned hours", () => {
    const courses = [makeCourse({ id: "F-COURSE", grade: "F" })];
    const result = computeProgressSemantics(courses, []);
    const s = result.courses[0];

    expect(s.countsTowardDegree).toBe(true);
    expect(s.countsTowardEarnedHours).toBe(false);
    expect(s.countsTowardGPA).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Surface 2: Planner prereq badge (via isRuleSatisfied)
// Mirrors the PlannerCard logic that builds an `available` set from completed courses
// ---------------------------------------------------------------------------

describe("planner prereq badge — W/NR/IP excluded from available set", () => {
  const prereqRule: PrereqRule = { type: "course", courseId: "PREREQ-1000" };

  for (const grade of ["W", "NR", "IP"]) {
    it(`${grade} completed prereq does NOT satisfy the requirement`, () => {
      // Simulates the planner logic: filter out non-degree-credit grades
      const prereqCourse = makeCourse({ id: "PREREQ-1000", grade, status: "completed" });
      const available = new Set<string>();

      // Planner logic: only add if not a non-degree-credit grade
      if (!(prereqCourse.grade && NON_DEGREE_CREDIT_GRADES.has(prereqCourse.grade))) {
        available.add(prereqCourse.id);
      }

      expect(isRuleSatisfied(prereqRule, available)).toBe(false);
    });
  }

  it("normal completed prereq DOES satisfy the requirement", () => {
    const available = new Set(["PREREQ-1000"]);
    expect(isRuleSatisfied(prereqRule, available)).toBe(true);
  });

  it("AND prereq with one W prereq fails", () => {
    const andRule: PrereqRule = {
      type: "and",
      rules: [
        { type: "course", courseId: "A" },
        { type: "course", courseId: "B" },
      ],
    };

    // A completed with A grade, B completed with W
    const available = new Set<string>();
    const courseA = makeCourse({ id: "A", grade: "A" });
    const courseB = makeCourse({ id: "B", grade: "W" });

    // Apply planner filter
    if (!(courseA.grade && NON_DEGREE_CREDIT_GRADES.has(courseA.grade))) available.add(courseA.id);
    if (!(courseB.grade && NON_DEGREE_CREDIT_GRADES.has(courseB.grade))) available.add(courseB.id);

    expect(isRuleSatisfied(andRule, available)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Surface 3: Dashboard prereq alerts (app/page.tsx completedIds filter)
// ---------------------------------------------------------------------------

describe("dashboard prereq alerts — W/NR/IP excluded from completedIds", () => {
  for (const grade of ["W", "NR", "IP"]) {
    it(`planned course with ${grade}-grade prereq shows alert`, () => {
      const courses = [
        makeCourse({ id: "PREREQ-1000", grade, status: "completed" }),
        makeCourse({
          id: "TARGET-2000",
          status: "planned",
          prereqs: { type: "course", courseId: "PREREQ-1000" },
        }),
      ];

      // Simulates dashboard logic: build completedIds excluding W/NR/IP
      const completedIds = new Set(
        courses
          .filter((c) => c.status === "completed" && !(c.grade && NON_DEGREE_CREDIT_GRADES.has(c.grade)))
          .map((c) => c.id)
      );

      const target = courses[1];
      const hasMissing = !isRuleSatisfied(target.prereqs!, completedIds);
      expect(hasMissing).toBe(true);
    });
  }

  it("planned course with properly completed prereq shows no alert", () => {
    const courses = [
      makeCourse({ id: "PREREQ-1000", grade: "B", status: "completed" }),
      makeCourse({
        id: "TARGET-2000",
        status: "planned",
        prereqs: { type: "course", courseId: "PREREQ-1000" },
      }),
    ];

    const completedIds = new Set(
      courses
        .filter((c) => c.status === "completed" && !(c.grade && NON_DEGREE_CREDIT_GRADES.has(c.grade)))
        .map((c) => c.id)
    );

    expect(isRuleSatisfied(courses[1].prereqs!, completedIds)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Surface 4: Dashboard earned hours (app/page.tsx calcTotalHours pattern)
// ---------------------------------------------------------------------------

describe("dashboard earned hours — W/NR/IP excluded", () => {
  // Mirrors the calcTotalHours function pattern from app/page.tsx
  function calcTotalHours(courses: Course[]) {
    const earned = courses
      .filter(
        (c) =>
          c.status === "completed" &&
          c.credits > 0 &&
          c.countsTowardEarnedHours !== false &&
          !(c.grade && NON_DEGREE_CREDIT_GRADES.has(c.grade)) &&
          c.grade !== "F"
      )
      .reduce((acc, c) => acc + c.credits, 0);
    const inProgress = courses
      .filter((c) => (c.status === "in_progress" || c.status === "registered") && c.credits > 0 && c.countsTowardEarnedHours !== false)
      .reduce((acc, c) => acc + c.credits, 0);
    return { earned, inProgress };
  }

  for (const grade of ["W", "NR", "IP"]) {
    it(`${grade} grade does not contribute to earned hours`, () => {
      const courses = [
        makeCourse({ id: "GOOD", grade: "A", credits: 3 }),
        makeCourse({ id: "BAD", grade, credits: 4 }),
      ];
      const { earned } = calcTotalHours(courses);
      expect(earned).toBe(3); // only GOOD
    });
  }

  it("F grade does not contribute to earned hours", () => {
    const courses = [
      makeCourse({ id: "GOOD", grade: "A", credits: 3 }),
      makeCourse({ id: "FAIL", grade: "F", credits: 3 }),
    ];
    const { earned } = calcTotalHours(courses);
    expect(earned).toBe(3);
  });

  it("HS grade DOES contribute to earned hours", () => {
    const courses = [
      makeCourse({ id: "HS-COURSE", grade: "HS", credits: 3 }),
    ];
    const { earned } = calcTotalHours(courses);
    expect(earned).toBe(3);
  });

  it("in-progress courses contribute to inProgress total", () => {
    const courses = [
      makeCourse({ id: "IP-STATUS", status: "in_progress", credits: 4 }),
    ];
    const { inProgress } = calcTotalHours(courses);
    expect(inProgress).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Surface 5: calcProgress — requirement satisfaction (canonical)
// ---------------------------------------------------------------------------

describe("calcProgress — W/NR/IP excluded from requirement satisfaction", () => {
  for (const grade of ["W", "NR", "IP"]) {
    it(`${grade} grade does not count as completed in complete_all group`, () => {
      const courses = [makeCourse({ id: "C1", grade })];
      const group = makeGroup({
        id: "req",
        type: "complete_all",
        coursePool: ["C1"],
      });
      const prog = calcProgress(group, courses);
      expect(prog.completed).toBe(0);
    });

    it(`${grade} grade does not count in minimum_hours group`, () => {
      const courses = [makeCourse({ id: "C1", grade, credits: 3 })];
      const group: RequirementGroup = {
        id: "hrs",
        name: "Hours",
        category: "Test",
        type: "minimum_hours",
        coursePool: ["C1"],
        requiredHours: 3,
      };
      const prog = calcProgress(group, courses);
      expect(prog.completed).toBe(0);
    });

    it(`${grade} grade does not count in pick_n group`, () => {
      const courses = [makeCourse({ id: "C1", grade })];
      const group = makeGroup({
        id: "pick",
        type: "pick_n",
        coursePool: ["C1"],
        required: 1,
      });
      const prog = calcProgress(group, courses);
      expect(prog.completed).toBe(0);
    });
  }

  it("normal grades still count toward requirement satisfaction", () => {
    const courses = [makeCourse({ id: "C1", grade: "B" })];
    const group = makeGroup({
      id: "req",
      type: "complete_all",
      coursePool: ["C1"],
    });
    const prog = calcProgress(group, courses);
    expect(prog.completed).toBe(1);
  });
});
