/**
 * Tests for lib/planner-validation.ts — plan-level validation summary.
 * Pure domain logic — no I/O, no server dependencies.
 */

import { describe, it, expect } from "vitest";
import {
  validatePlan,
  MAX_TERM_CREDITS,
  MIN_TERM_CREDITS,
  type PlannerValidationSummary,
} from "../lib/planner-validation";
import type { Course, Semester, RequirementGroup } from "../lib/types";

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

function makeSemester(overrides: Partial<Semester> & { id: string }): Semester {
  const season = overrides.id.slice(0, 2);
  const yy = parseInt(overrides.id.slice(2));
  const year = yy <= 50 ? 2000 + yy : 1900 + yy;
  return {
    label: `${season === "FA" ? "Fall" : season === "SP" ? "Spring" : "Summer"} ${year}`,
    type: season === "FA" ? "fall" : season === "SP" ? "spring" : "summer",
    year,
    status: "planned",
    courses: [],
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
// Prereq violations
// ---------------------------------------------------------------------------

describe("validatePlan — prereq violations", () => {
  const sems = [
    makeSemester({ id: "FA25" }),
    makeSemester({ id: "SP26" }),
    makeSemester({ id: "FA26" }),
  ];

  it("detects prereq violation when prereq is in same semester", () => {
    const courses = [
      makeCourse({ id: "MATH-1300", status: "planned", semester: "SP26" }),
      makeCourse({
        id: "MATH-2300",
        status: "planned",
        semester: "SP26",
        prereqs: { type: "course", courseId: "MATH-1300" },
      }),
    ];

    const result = validatePlan(courses, sems, []);
    expect(result.prereqViolations).toHaveLength(1);
    expect(result.prereqViolations[0].courseId).toBe("MATH-2300");
    expect(result.prereqViolations[0].missing).toContain("MATH-1300");
  });

  it("no violation when prereq is in earlier semester", () => {
    const courses = [
      makeCourse({ id: "MATH-1300", status: "planned", semester: "FA25" }),
      makeCourse({
        id: "MATH-2300",
        status: "planned",
        semester: "SP26",
        prereqs: { type: "course", courseId: "MATH-1300" },
      }),
    ];

    const result = validatePlan(courses, sems, []);
    expect(result.prereqViolations).toHaveLength(0);
  });

  it("completed courses with passing grade satisfy prereqs", () => {
    const courses = [
      makeCourse({ id: "MATH-1300", status: "completed", grade: "B" }),
      makeCourse({
        id: "MATH-2300",
        status: "planned",
        semester: "FA25",
        prereqs: { type: "course", courseId: "MATH-1300" },
      }),
    ];

    const result = validatePlan(courses, sems, []);
    expect(result.prereqViolations).toHaveLength(0);
  });

  it("detects prereq violation with unplanned prereq", () => {
    const courses = [
      makeCourse({ id: "MATH-1300", status: "not_started" }), // no semester
      makeCourse({
        id: "MATH-2300",
        status: "planned",
        semester: "SP26",
        prereqs: { type: "course", courseId: "MATH-1300" },
      }),
    ];

    const result = validatePlan(courses, sems, []);
    expect(result.prereqViolations).toHaveLength(1);
    expect(result.prereqViolations[0].missing).toContain("MATH-1300");
  });

  it("uses assignments map over course.semester when provided", () => {
    const courses = [
      makeCourse({ id: "MATH-1300", status: "planned", semester: "SP26" }),
      makeCourse({
        id: "MATH-2300",
        status: "planned",
        semester: "FA26",
        prereqs: { type: "course", courseId: "MATH-1300" },
      }),
    ];

    // Assignments override: put MATH-1300 in FA26 (same as MATH-2300)
    const assignments = new Map([
      ["MATH-1300", "FA26"],
      ["MATH-2300", "FA26"],
    ]);

    const result = validatePlan(courses, sems, [], assignments);
    expect(result.prereqViolations).toHaveLength(1);
  });

  it("completed W course does NOT satisfy prereqs", () => {
    const courses = [
      makeCourse({ id: "MATH-1300", status: "completed", grade: "W" }),
      makeCourse({
        id: "MATH-2300",
        status: "planned",
        semester: "FA25",
        prereqs: { type: "course", courseId: "MATH-1300" },
      }),
    ];

    const result = validatePlan(courses, sems, []);
    expect(result.prereqViolations).toHaveLength(1);
    expect(result.prereqViolations[0].courseId).toBe("MATH-2300");
    expect(result.prereqViolations[0].missing).toContain("MATH-1300");
  });

  it("completed NR/IP courses do NOT satisfy prereqs", () => {
    for (const grade of ["NR", "IP"]) {
      const courses = [
        makeCourse({ id: "MATH-1300", status: "completed", grade }),
        makeCourse({
          id: "MATH-2300",
          status: "planned",
          semester: "FA25",
          prereqs: { type: "course", courseId: "MATH-1300" },
        }),
      ];

      const result = validatePlan(courses, sems, []);
      expect(result.prereqViolations).toHaveLength(1);
    }
  });

  it("skips unplanned courses for violation detection", () => {
    const courses = [
      makeCourse({
        id: "MATH-2300",
        status: "not_started",
        prereqs: { type: "course", courseId: "MATH-1300" },
      }),
    ];

    const result = validatePlan(courses, sems, []);
    // Course is unplanned — should not produce a violation
    expect(result.prereqViolations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Coreq violations
// ---------------------------------------------------------------------------

describe("validatePlan — coreq violations", () => {
  const sems = [
    makeSemester({ id: "FA25" }),
    makeSemester({ id: "SP26" }),
  ];

  it("no violation when coreq is in same semester", () => {
    const courses = [
      makeCourse({ id: "PHYS-1110", status: "planned", semester: "SP26" }),
      makeCourse({
        id: "PHYS-1140",
        status: "planned",
        semester: "SP26",
        coreqs: { type: "course", courseId: "PHYS-1110" },
      }),
    ];

    const result = validatePlan(courses, sems, []);
    expect(result.coreqViolations).toHaveLength(0);
  });

  it("detects coreq violation when coreq is in later semester", () => {
    const courses = [
      makeCourse({ id: "PHYS-1110", status: "planned", semester: "SP26" }),
      makeCourse({
        id: "PHYS-1140",
        status: "planned",
        semester: "FA25",
        coreqs: { type: "course", courseId: "PHYS-1110" },
      }),
    ];

    const result = validatePlan(courses, sems, []);
    expect(result.coreqViolations).toHaveLength(1);
    expect(result.coreqViolations[0].courseId).toBe("PHYS-1140");
    expect(result.coreqViolations[0].missing).toContain("PHYS-1110");
  });

  it("no violation when coreq is in earlier semester", () => {
    const courses = [
      makeCourse({ id: "PHYS-1110", status: "planned", semester: "FA25" }),
      makeCourse({
        id: "PHYS-1140",
        status: "planned",
        semester: "SP26",
        coreqs: { type: "course", courseId: "PHYS-1110" },
      }),
    ];

    const result = validatePlan(courses, sems, []);
    expect(result.coreqViolations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Term load issues
// ---------------------------------------------------------------------------

describe("validatePlan — term load", () => {
  it("flags overloaded terms (>18 credits)", () => {
    const sems = [makeSemester({ id: "FA26", status: "planned" })];
    const courses = [
      makeCourse({ id: "A", status: "planned", semester: "FA26", credits: 5 }),
      makeCourse({ id: "B", status: "planned", semester: "FA26", credits: 5 }),
      makeCourse({ id: "C", status: "planned", semester: "FA26", credits: 5 }),
      makeCourse({ id: "D", status: "planned", semester: "FA26", credits: 4 }),
    ]; // 19 credits

    const result = validatePlan(courses, sems, []);
    expect(result.termLoadIssues).toHaveLength(1);
    expect(result.termLoadIssues[0].kind).toBe("overloaded");
    expect(result.termLoadIssues[0].credits).toBe(19);
  });

  it("flags underloaded planned terms (<12 credits)", () => {
    const sems = [makeSemester({ id: "FA26", status: "planned" })];
    const courses = [
      makeCourse({ id: "A", status: "planned", semester: "FA26", credits: 3 }),
      makeCourse({ id: "B", status: "planned", semester: "FA26", credits: 3 }),
    ]; // 6 credits

    const result = validatePlan(courses, sems, []);
    expect(result.termLoadIssues).toHaveLength(1);
    expect(result.termLoadIssues[0].kind).toBe("underloaded");
  });

  it("does not flag underloaded completed semesters", () => {
    const sems = [makeSemester({ id: "FA25", status: "completed" })];
    const courses = [
      makeCourse({ id: "A", status: "completed", semester: "FA25", credits: 6 }),
    ];

    const result = validatePlan(courses, sems, []);
    const underloaded = result.termLoadIssues.filter((i) => i.kind === "underloaded");
    expect(underloaded).toHaveLength(0);
  });

  it("does not flag empty semesters", () => {
    const sems = [makeSemester({ id: "FA26", status: "planned" })];
    const result = validatePlan([], sems, []);
    expect(result.termLoadIssues).toHaveLength(0);
  });

  it("18 credits is within bounds", () => {
    const sems = [makeSemester({ id: "FA26", status: "planned" })];
    const courses = [
      makeCourse({ id: "A", status: "planned", semester: "FA26", credits: 6 }),
      makeCourse({ id: "B", status: "planned", semester: "FA26", credits: 6 }),
      makeCourse({ id: "C", status: "planned", semester: "FA26", credits: 6 }),
    ]; // exactly 18

    const result = validatePlan(courses, sems, []);
    expect(result.termLoadIssues).toHaveLength(0);
  });

  it("12 credits is within bounds", () => {
    const sems = [makeSemester({ id: "FA26", status: "planned" })];
    const courses = [
      makeCourse({ id: "A", status: "planned", semester: "FA26", credits: 4 }),
      makeCourse({ id: "B", status: "planned", semester: "FA26", credits: 4 }),
      makeCourse({ id: "C", status: "planned", semester: "FA26", credits: 4 }),
    ]; // exactly 12

    const result = validatePlan(courses, sems, []);
    expect(result.termLoadIssues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unmet requirements
// ---------------------------------------------------------------------------

describe("validatePlan — unmet requirements", () => {
  it("identifies incomplete requirement groups", () => {
    const courses = [
      makeCourse({ id: "A", status: "completed" }),
      makeCourse({ id: "B", status: "not_started" }),
    ];
    const groups = [
      makeGroup({
        id: "req1",
        name: "Core Math",
        type: "complete_all",
        coursePool: ["A", "B"],
      }),
    ];

    const result = validatePlan(courses, [], groups);
    expect(result.unmetRequirements).toHaveLength(1);
    expect(result.unmetRequirements[0].groupName).toBe("Core Math");
    expect(result.unmetRequirements[0].completed).toBe(1);
    expect(result.unmetRequirements[0].total).toBe(2);
  });

  it("does not include fully-met groups", () => {
    const courses = [
      makeCourse({ id: "A", status: "completed" }),
      makeCourse({ id: "B", status: "completed" }),
    ];
    const groups = [
      makeGroup({
        id: "req1",
        name: "Done Group",
        type: "complete_all",
        coursePool: ["A", "B"],
      }),
    ];

    const result = validatePlan(courses, [], groups);
    expect(result.unmetRequirements).toHaveLength(0);
  });

  it("tracks in-progress toward requirements", () => {
    const courses = [
      makeCourse({ id: "A", status: "in_progress" }),
      makeCourse({ id: "B", status: "not_started" }),
    ];
    const groups = [
      makeGroup({
        id: "req1",
        name: "In Progress Group",
        type: "complete_all",
        coursePool: ["A", "B"],
      }),
    ];

    const result = validatePlan(courses, [], groups);
    expect(result.unmetRequirements).toHaveLength(1);
    expect(result.unmetRequirements[0].inProgress).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Degree-semantic progress in unmet requirements
// ---------------------------------------------------------------------------

describe("validatePlan — degree-semantic requirement progress", () => {
  it("course with countedTowardDegree=false does not satisfy requirement", () => {
    const courses = [
      makeCourse({ id: "A", status: "completed", countedTowardDegree: false }),
      makeCourse({ id: "B", status: "completed" }),
    ];
    const groups = [
      makeGroup({
        id: "req1",
        name: "Core",
        type: "complete_all",
        coursePool: ["A", "B"],
      }),
    ];

    const result = validatePlan(courses, [], groups);
    expect(result.unmetRequirements).toHaveLength(1);
    expect(result.unmetRequirements[0].completed).toBe(1); // only B
    expect(result.unmetRequirements[0].total).toBe(2);
  });

  it("course below minGrade does not satisfy requirement", () => {
    const courses = [
      makeCourse({ id: "A", status: "completed", grade: "D" }),
      makeCourse({ id: "B", status: "completed", grade: "B" }),
    ];
    const groups = [
      makeGroup({
        id: "req1",
        name: "Core with min grade",
        type: "complete_all",
        coursePool: ["A", "B"],
        minGrade: "C-",
      }),
    ];

    const result = validatePlan(courses, [], groups);
    expect(result.unmetRequirements).toHaveLength(1);
    expect(result.unmetRequirements[0].completed).toBe(1); // only B meets C-
  });

  it("course at exactly minGrade satisfies requirement", () => {
    const courses = [
      makeCourse({ id: "A", status: "completed", grade: "C-" }),
      makeCourse({ id: "B", status: "completed", grade: "A" }),
    ];
    const groups = [
      makeGroup({
        id: "req1",
        name: "Core",
        type: "complete_all",
        coursePool: ["A", "B"],
        minGrade: "C-",
      }),
    ];

    const result = validatePlan(courses, [], groups);
    expect(result.unmetRequirements).toHaveLength(0);
  });

  it("minimum_hours excludes non-degree-counted courses from earned total", () => {
    const courses = [
      makeCourse({ id: "A", status: "completed", credits: 3, countedTowardDegree: false }),
      makeCourse({ id: "B", status: "completed", credits: 3 }),
    ];
    const groups = [
      makeGroup({
        id: "req1",
        name: "Hours Req",
        type: "minimum_hours",
        requiredHours: 6,
        coursePool: ["A", "B"],
      }),
    ];

    const result = validatePlan(courses, [], groups);
    // Only B's 3 credits count, so 3/6 = unmet
    expect(result.unmetRequirements).toHaveLength(1);
    expect(result.unmetRequirements[0].completed).toBe(3);
  });

  it("withdrawn course does not satisfy requirement even if completed status", () => {
    const courses = [
      makeCourse({ id: "A", status: "completed", grade: "W" }),
      makeCourse({ id: "B", status: "completed", grade: "B" }),
    ];
    const groups = [
      makeGroup({
        id: "req1",
        name: "Core",
        type: "complete_all",
        coursePool: ["A", "B"],
        minGrade: "C-",
      }),
    ];

    const result = validatePlan(courses, [], groups);
    // W has no grade points in GRADE_SCALE, so meetsMinGrade returns true (no penalize)
    // BUT the W grade doesn't have points defined, so it passes through
    // Actually: W is not in GRADE_SCALE so gradeToPoints returns -1/undefined
    // meetsMinGrade: GRADE_SCALE["W"] is undefined, so returns true
    // This is correct for groups WITHOUT minGrade (W is just status-based)
    // For groups WITH minGrade, W shouldn't satisfy — but our logic returns true
    // because coursePoints is undefined. Let's verify this is handled.
    expect(result.unmetRequirements).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Unplanned required courses
// ---------------------------------------------------------------------------

describe("validatePlan — unplanned required courses", () => {
  it("detects required courses without a semester assignment", () => {
    const courses = [
      makeCourse({ id: "STAT-3100", status: "not_started" }), // no semester
    ];
    const groups = [
      makeGroup({
        id: "req1",
        name: "Stats Core",
        coursePool: ["STAT-3100"],
      }),
    ];

    const result = validatePlan(courses, [], groups);
    expect(result.unplannedRequired).toHaveLength(1);
    expect(result.unplannedRequired[0].courseId).toBe("STAT-3100");
    expect(result.unplannedRequired[0].groups).toContain("Stats Core");
  });

  it("does not flag completed courses", () => {
    const courses = [
      makeCourse({ id: "STAT-3100", status: "completed" }),
    ];
    const groups = [
      makeGroup({
        id: "req1",
        name: "Stats Core",
        coursePool: ["STAT-3100"],
      }),
    ];

    const result = validatePlan(courses, [], groups);
    expect(result.unplannedRequired).toHaveLength(0);
  });

  it("does not flag planned courses with semester assignment", () => {
    const sems = [makeSemester({ id: "FA26" })];
    const courses = [
      makeCourse({ id: "STAT-3100", status: "planned", semester: "FA26" }),
    ];
    const groups = [
      makeGroup({
        id: "req1",
        name: "Stats Core",
        coursePool: ["STAT-3100"],
      }),
    ];

    const result = validatePlan(courses, sems, groups);
    expect(result.unplannedRequired).toHaveLength(0);
  });

  it("does not flag in-progress courses", () => {
    const courses = [
      makeCourse({ id: "STAT-3100", status: "in_progress", semester: "SP26" }),
    ];
    const groups = [
      makeGroup({
        id: "req1",
        name: "Stats Core",
        coursePool: ["STAT-3100"],
      }),
    ];

    const result = validatePlan(courses, [], groups);
    expect(result.unplannedRequired).toHaveLength(0);
  });

  it("uses selectedCourses for pick_n groups when available", () => {
    const courses = [
      makeCourse({ id: "A", status: "not_started" }), // not selected
      makeCourse({ id: "B", status: "not_started" }), // selected, unplanned
    ];
    const groups = [
      makeGroup({
        id: "req1",
        name: "Electives",
        type: "pick_n",
        required: 1,
        coursePool: ["A", "B"],
        selectedCourses: ["B"],
      }),
    ];

    const result = validatePlan(courses, [], groups);
    // Only B should be flagged (it's selected but unplanned), A should not
    expect(result.unplannedRequired).toHaveLength(1);
    expect(result.unplannedRequired[0].courseId).toBe("B");
  });
});

// ---------------------------------------------------------------------------
// Projected completion term
// ---------------------------------------------------------------------------

describe("validatePlan — projected completion term", () => {
  it("returns the last semester with incomplete courses", () => {
    const sems = [
      makeSemester({ id: "FA25" }),
      makeSemester({ id: "SP26" }),
      makeSemester({ id: "FA26" }),
    ];
    const courses = [
      makeCourse({ id: "A", status: "completed", semester: "FA25" }),
      makeCourse({ id: "B", status: "planned", semester: "SP26" }),
      makeCourse({ id: "C", status: "planned", semester: "FA26" }),
    ];

    const result = validatePlan(courses, sems, []);
    expect(result.projectedCompletionTerm).not.toBeNull();
    expect(result.projectedCompletionTerm!.semesterId).toBe("FA26");
  });

  it("returns null when all courses are completed", () => {
    const sems = [makeSemester({ id: "FA25" })];
    const courses = [
      makeCourse({ id: "A", status: "completed", semester: "FA25" }),
    ];

    const result = validatePlan(courses, sems, []);
    expect(result.projectedCompletionTerm).toBeNull();
  });

  it("counts in-progress as incomplete for projection", () => {
    const sems = [
      makeSemester({ id: "FA25" }),
      makeSemester({ id: "SP26" }),
    ];
    const courses = [
      makeCourse({ id: "A", status: "completed", semester: "FA25" }),
      makeCourse({ id: "B", status: "in_progress", semester: "SP26" }),
    ];

    const result = validatePlan(courses, sems, []);
    expect(result.projectedCompletionTerm!.semesterId).toBe("SP26");
  });
});

// ---------------------------------------------------------------------------
// Clean flag
// ---------------------------------------------------------------------------

describe("validatePlan — clean flag", () => {
  it("clean=true when no issues", () => {
    const sems = [makeSemester({ id: "FA25", status: "completed" })];
    const courses = [
      makeCourse({ id: "A", status: "completed", semester: "FA25" }),
    ];
    const groups = [
      makeGroup({
        id: "req1",
        name: "Done",
        coursePool: ["A"],
      }),
    ];

    const result = validatePlan(courses, sems, groups);
    expect(result.clean).toBe(true);
  });

  it("clean=false when prereq violation exists", () => {
    const sems = [makeSemester({ id: "SP26" })];
    const courses = [
      makeCourse({
        id: "MATH-2300",
        status: "planned",
        semester: "SP26",
        prereqs: { type: "course", courseId: "MATH-1300" },
      }),
    ];

    const result = validatePlan(courses, sems, []);
    expect(result.clean).toBe(false);
  });

  it("clean=false when unmet requirements exist", () => {
    const courses = [
      makeCourse({ id: "A", status: "not_started" }),
    ];
    const groups = [
      makeGroup({ id: "req1", name: "Unmet", coursePool: ["A"] }),
    ];

    const result = validatePlan(courses, [], groups);
    expect(result.clean).toBe(false);
  });

  it("term load issues make clean=false", () => {
    // Overloaded/underloaded terms are validation issues that affect clean status
    const sems = [makeSemester({ id: "FA26", status: "planned" })];
    const courses = [
      makeCourse({ id: "A", status: "completed", semester: "FA26", credits: 10 }),
      makeCourse({ id: "B", status: "completed", semester: "FA26", credits: 10 }),
    ];
    const groups = [
      makeGroup({ id: "req1", coursePool: ["A", "B"] }),
    ];

    const result = validatePlan(courses, sems, groups);
    expect(result.termLoadIssues.length).toBeGreaterThan(0);
    expect(result.clean).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: combined scenario
// ---------------------------------------------------------------------------

describe("validatePlan — integration", () => {
  it("full scenario with mixed issues", () => {
    const sems = [
      makeSemester({ id: "FA25", status: "completed" }),
      makeSemester({ id: "SP26", status: "planned" }),
      makeSemester({ id: "FA26", status: "planned" }),
    ];

    const courses = [
      // Completed
      makeCourse({ id: "MATH-1300", status: "completed", semester: "FA25" }),
      // Planned with satisfied prereq
      makeCourse({
        id: "MATH-2300",
        status: "planned",
        semester: "SP26",
        prereqs: { type: "course", courseId: "MATH-1300" },
      }),
      // Planned with missing prereq (STAT-2600 not taken)
      makeCourse({
        id: "STAT-3100",
        status: "planned",
        semester: "SP26",
        prereqs: { type: "course", courseId: "STAT-2600" },
      }),
      // Required but unplanned
      makeCourse({ id: "STAT-2600", status: "not_started" }),
    ];

    const groups = [
      makeGroup({
        id: "stats-core",
        name: "Stats Core",
        coursePool: ["STAT-2600", "STAT-3100"],
      }),
      makeGroup({
        id: "math",
        name: "Math Foundation",
        coursePool: ["MATH-1300", "MATH-2300"],
      }),
    ];

    const result = validatePlan(courses, sems, groups);

    // STAT-3100 has missing prereq STAT-2600
    expect(result.prereqViolations).toHaveLength(1);
    expect(result.prereqViolations[0].courseId).toBe("STAT-3100");

    // Stats Core is incomplete (0/2)
    expect(result.unmetRequirements.some((r) => r.groupName === "Stats Core")).toBe(true);

    // STAT-2600 is unplanned but required
    expect(result.unplannedRequired.some((c) => c.courseId === "STAT-2600")).toBe(true);

    // Projected completion: FA26 would be last if STAT-3100 is in SP26... wait
    // Actually latest semester with incomplete is SP26 (MATH-2300 and STAT-3100)
    // No courses in FA26, so projected = SP26
    expect(result.projectedCompletionTerm!.semesterId).toBe("SP26");

    expect(result.clean).toBe(false);
  });
});
