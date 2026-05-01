/**
 * Tests for lib/prereqs.ts — GPA calculation, prereq validation, progress tracking.
 * Pure domain logic — no I/O, no server dependencies.
 */

import { describe, it, expect } from "vitest";
import {
  gradeToPoints,
  calcGPA,
  calcProgress,
  validateDrop,
  getCascadeWarnings,
  isRuleSatisfied,
  getMissingIds,
  collectCourseIds,
  solveTargetGrade,
  semesterOrder,
  sortSemesters,
  GRADE_SCALE,
} from "../lib/prereqs";
import type { Course, Semester, RequirementGroup, PrereqRule } from "../lib/types";

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

// ---------------------------------------------------------------------------
// Grade scale
// ---------------------------------------------------------------------------

describe("gradeToPoints", () => {
  it("returns correct points for standard grades", () => {
    expect(gradeToPoints("A")).toBe(4.0);
    expect(gradeToPoints("A-")).toBe(3.7);
    expect(gradeToPoints("B+")).toBe(3.3);
    expect(gradeToPoints("B")).toBe(3.0);
    expect(gradeToPoints("C")).toBe(2.0);
    expect(gradeToPoints("D-")).toBe(0.7);
    expect(gradeToPoints("F")).toBe(0.0);
  });

  it("returns -1 for unknown grades (HS, W, P, etc.)", () => {
    expect(gradeToPoints("HS")).toBe(-1);
    expect(gradeToPoints("W")).toBe(-1);
    expect(gradeToPoints("P")).toBe(-1);
    expect(gradeToPoints("***")).toBe(-1);
    expect(gradeToPoints("NR")).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// GPA calculation
// ---------------------------------------------------------------------------

describe("calcGPA", () => {
  it("calculates correct GPA for simple case", () => {
    const courses = [
      makeCourse({ id: "STAT-3100", credits: 3, grade: "A" }),   // 12 pts
      makeCourse({ id: "MATH-1300", credits: 4, grade: "B" }),   // 12 pts
      makeCourse({ id: "ENGL-1010", credits: 3, grade: "C" }),   // 6 pts
    ];
    // Total: 30 pts / 10 credits = 3.0
    expect(calcGPA(courses)).toBeCloseTo(3.0, 4);
  });

  it("excludes courses with countsTowardGPA=false", () => {
    const courses = [
      makeCourse({ id: "STAT-3100", credits: 3, grade: "A" }),
      makeCourse({ id: "BAD-1000", credits: 3, grade: "F", countsTowardGPA: false }),
    ];
    // Only STAT-3100 counts: 12/3 = 4.0
    expect(calcGPA(courses)).toBeCloseTo(4.0, 4);
  });

  it("excludes HS grades", () => {
    const courses = [
      makeCourse({ id: "SPAN-HS", credits: 3, grade: "HS" }),
      makeCourse({ id: "STAT-3100", credits: 3, grade: "B" }),
    ];
    expect(calcGPA(courses)).toBeCloseTo(3.0, 4);
  });

  it("includes F grades in GPA", () => {
    const courses = [
      makeCourse({ id: "STAT-3100", credits: 3, grade: "A" }),   // 12
      makeCourse({ id: "CSCI-1200", credits: 3, grade: "F" }),   // 0
    ];
    // 12/6 = 2.0
    expect(calcGPA(courses)).toBeCloseTo(2.0, 4);
  });

  it("supports what-if grade overrides", () => {
    const courses = [
      makeCourse({ id: "STAT-3100", credits: 3, grade: "B" }),
      makeCourse({ id: "MATH-1300", credits: 3, grade: "C" }),
    ];
    const whatIf = new Map([["MATH-1300", "A"]]);
    // B=3.0*3=9, A=4.0*3=12 → 21/6 = 3.5
    expect(calcGPA(courses, whatIf)).toBeCloseTo(3.5, 4);
  });

  it("returns 0 for empty courses", () => {
    expect(calcGPA([])).toBe(0);
  });

  it("returns 0 when all courses have unknown grades", () => {
    const courses = [
      makeCourse({ id: "STAT-3100", credits: 3, grade: "HS" }),
    ];
    expect(calcGPA(courses)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Prereq rule evaluation
// ---------------------------------------------------------------------------

describe("isRuleSatisfied", () => {
  it("checks a single course rule", () => {
    const rule: PrereqRule = { type: "course", courseId: "MATH-1300" };
    expect(isRuleSatisfied(rule, new Set(["MATH-1300"]))).toBe(true);
    expect(isRuleSatisfied(rule, new Set(["STAT-3100"]))).toBe(false);
  });

  it("checks AND rules", () => {
    const rule: PrereqRule = {
      type: "and",
      rules: [
        { type: "course", courseId: "MATH-1300" },
        { type: "course", courseId: "MATH-2300" },
      ],
    };
    expect(isRuleSatisfied(rule, new Set(["MATH-1300", "MATH-2300"]))).toBe(true);
    expect(isRuleSatisfied(rule, new Set(["MATH-1300"]))).toBe(false);
  });

  it("checks OR rules", () => {
    const rule: PrereqRule = {
      type: "or",
      rules: [
        { type: "course", courseId: "APPM-2340" },
        { type: "course", courseId: "MATH-2400" },
      ],
    };
    expect(isRuleSatisfied(rule, new Set(["APPM-2340"]))).toBe(true);
    expect(isRuleSatisfied(rule, new Set(["MATH-2400"]))).toBe(true);
    expect(isRuleSatisfied(rule, new Set([]))).toBe(false);
  });

  it("handles nested AND/OR rules", () => {
    const rule: PrereqRule = {
      type: "and",
      rules: [
        { type: "course", courseId: "MATH-1300" },
        {
          type: "or",
          rules: [
            { type: "course", courseId: "APPM-2340" },
            { type: "course", courseId: "MATH-2400" },
          ],
        },
      ],
    };
    expect(isRuleSatisfied(rule, new Set(["MATH-1300", "APPM-2340"]))).toBe(true);
    expect(isRuleSatisfied(rule, new Set(["MATH-1300", "MATH-2400"]))).toBe(true);
    expect(isRuleSatisfied(rule, new Set(["MATH-1300"]))).toBe(false);
    expect(isRuleSatisfied(rule, new Set(["APPM-2340"]))).toBe(false);
  });
});

describe("getMissingIds", () => {
  it("returns missing course for simple rule", () => {
    const rule: PrereqRule = { type: "course", courseId: "MATH-1300" };
    expect(getMissingIds(rule, new Set([]))).toEqual(["MATH-1300"]);
    expect(getMissingIds(rule, new Set(["MATH-1300"]))).toEqual([]);
  });

  it("returns all missing for AND rule", () => {
    const rule: PrereqRule = {
      type: "and",
      rules: [
        { type: "course", courseId: "MATH-1300" },
        { type: "course", courseId: "MATH-2300" },
      ],
    };
    const missing = getMissingIds(rule, new Set(["MATH-1300"]));
    expect(missing).toEqual(["MATH-2300"]);
  });

  it("returns fewest-missing branch for OR rule", () => {
    const rule: PrereqRule = {
      type: "or",
      rules: [
        {
          type: "and",
          rules: [
            { type: "course", courseId: "A" },
            { type: "course", courseId: "B" },
          ],
        },
        { type: "course", courseId: "C" },
      ],
    };
    // C branch has 1 missing, A+B has 2 — should pick C
    const missing = getMissingIds(rule, new Set([]));
    expect(missing).toEqual(["C"]);
  });
});

describe("collectCourseIds", () => {
  it("collects all leaf courseIds from nested rules", () => {
    const rule: PrereqRule = {
      type: "and",
      rules: [
        { type: "course", courseId: "A" },
        {
          type: "or",
          rules: [
            { type: "course", courseId: "B" },
            { type: "course", courseId: "C" },
          ],
        },
      ],
    };
    expect(collectCourseIds(rule).sort()).toEqual(["A", "B", "C"]);
  });
});

// ---------------------------------------------------------------------------
// Drop validation
// ---------------------------------------------------------------------------

describe("validateDrop", () => {
  const sems = sortSemesters([
    makeSemester({ id: "FA25" }),
    makeSemester({ id: "SP26" }),
    makeSemester({ id: "FA26" }),
  ]);

  it("allows drop when prereqs satisfied", () => {
    const prereqCourse = makeCourse({ id: "MATH-1300", status: "completed" });
    const course = makeCourse({
      id: "MATH-2300",
      status: "not_started",
      prereqs: { type: "course", courseId: "MATH-1300" },
    });

    const assignments = new Map([
      ["MATH-1300", "FA25"],
      ["MATH-2300", "SP26"],
    ]);

    const result = validateDrop(course, "SP26", [prereqCourse, course], sems, assignments);
    expect(result.valid).toBe(true);
    expect(result.missingPrereqs).toEqual([]);
  });

  it("rejects drop when prereqs not satisfied", () => {
    const prereqCourse = makeCourse({
      id: "MATH-1300",
      status: "not_started",
    });
    const course = makeCourse({
      id: "MATH-2300",
      status: "not_started",
      prereqs: { type: "course", courseId: "MATH-1300" },
    });

    const assignments = new Map([
      ["MATH-1300", "SP26"],
      ["MATH-2300", "SP26"],
    ]);

    const result = validateDrop(course, "SP26", [prereqCourse, course], sems, assignments);
    expect(result.valid).toBe(false);
    expect(result.missingPrereqs).toContain("MATH-1300");
  });

  it("completed courses count as always available for prereqs", () => {
    const prereqCourse = makeCourse({ id: "MATH-1300", status: "completed" });
    const course = makeCourse({
      id: "MATH-2300",
      status: "not_started",
      prereqs: { type: "course", courseId: "MATH-1300" },
    });

    const assignments = new Map([["MATH-2300", "FA25"]]);
    const result = validateDrop(course, "FA25", [prereqCourse, course], sems, assignments);
    expect(result.valid).toBe(true);
  });

  it("allows drop to 'unplanned' always", () => {
    const course = makeCourse({
      id: "MATH-2300",
      status: "not_started",
      prereqs: { type: "course", courseId: "MATH-1300" },
    });
    const result = validateDrop(course, "unplanned", [], sems, new Map());
    expect(result.valid).toBe(true);
  });

  it("rejects drop when prereq completed with grade W", () => {
    const prereqCourse = makeCourse({ id: "MATH-1300", status: "completed", grade: "W" });
    const course = makeCourse({
      id: "MATH-2300",
      status: "not_started",
      prereqs: { type: "course", courseId: "MATH-1300" },
    });

    const assignments = new Map([["MATH-2300", "SP26"]]);
    const result = validateDrop(course, "SP26", [prereqCourse, course], sems, assignments);
    expect(result.valid).toBe(false);
    expect(result.missingPrereqs).toContain("MATH-1300");
  });

  it("rejects drop when prereq completed with grade NR", () => {
    const prereqCourse = makeCourse({ id: "MATH-1300", status: "completed", grade: "NR" });
    const course = makeCourse({
      id: "MATH-2300",
      status: "not_started",
      prereqs: { type: "course", courseId: "MATH-1300" },
    });

    const assignments = new Map([["MATH-2300", "SP26"]]);
    const result = validateDrop(course, "SP26", [prereqCourse, course], sems, assignments);
    expect(result.valid).toBe(false);
    expect(result.missingPrereqs).toContain("MATH-1300");
  });

  it("rejects drop when prereq completed with grade IP", () => {
    const prereqCourse = makeCourse({ id: "MATH-1300", status: "completed", grade: "IP" });
    const course = makeCourse({
      id: "MATH-2300",
      status: "not_started",
      prereqs: { type: "course", courseId: "MATH-1300" },
    });

    const assignments = new Map([["MATH-2300", "SP26"]]);
    const result = validateDrop(course, "SP26", [prereqCourse, course], sems, assignments);
    expect(result.valid).toBe(false);
    expect(result.missingPrereqs).toContain("MATH-1300");
  });

  it("allows drop when prereq completed with passing grade", () => {
    const prereqCourse = makeCourse({ id: "MATH-1300", status: "completed", grade: "C" });
    const course = makeCourse({
      id: "MATH-2300",
      status: "not_started",
      prereqs: { type: "course", courseId: "MATH-1300" },
    });

    const assignments = new Map([["MATH-2300", "SP26"]]);
    const result = validateDrop(course, "SP26", [prereqCourse, course], sems, assignments);
    expect(result.valid).toBe(true);
    expect(result.missingPrereqs).toEqual([]);
  });

  it("rejects coreq when completed with grade W", () => {
    const coreqCourse = makeCourse({ id: "PHYS-1110", status: "completed", grade: "W" });
    const course = makeCourse({
      id: "PHYS-1140",
      status: "not_started",
      coreqs: { type: "course", courseId: "PHYS-1110" },
    });

    const assignments = new Map([["PHYS-1140", "SP26"]]);
    const result = validateDrop(course, "SP26", [coreqCourse, course], sems, assignments);
    expect(result.valid).toBe(false);
    expect(result.missingCoreqs).toContain("PHYS-1110");
  });

  it("validates coreqs (same semester OK)", () => {
    const coreqCourse = makeCourse({
      id: "PHYS-1110",
      status: "not_started",
    });
    const course = makeCourse({
      id: "PHYS-1140",
      status: "not_started",
      coreqs: { type: "course", courseId: "PHYS-1110" },
    });

    const assignments = new Map([
      ["PHYS-1110", "SP26"],
      ["PHYS-1140", "SP26"],
    ]);

    const result = validateDrop(
      course, "SP26", [coreqCourse, course], sems, assignments
    );
    expect(result.valid).toBe(true);
    expect(result.missingCoreqs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Cascade warnings
// ---------------------------------------------------------------------------

describe("getCascadeWarnings", () => {
  const sems = sortSemesters([
    makeSemester({ id: "FA25" }),
    makeSemester({ id: "SP26" }),
    makeSemester({ id: "FA26" }),
  ]);

  it("warns when moving a prereq later breaks downstream", () => {
    const courses = [
      makeCourse({ id: "MATH-1300" }),
      makeCourse({
        id: "MATH-2300",
        prereqs: { type: "course", courseId: "MATH-1300" },
      }),
    ];

    const assignments = new Map([
      ["MATH-1300", "FA25"],
      ["MATH-2300", "SP26"],
    ]);

    // Moving MATH-1300 from FA25 to FA26 should break MATH-2300 in SP26
    const warnings = getCascadeWarnings(
      "MATH-1300", "FA25", "FA26", courses, sems, assignments
    );
    expect(warnings.length).toBe(1);
    expect(warnings[0].number).toBe("MATH 2300");
  });

  it("returns empty when moving earlier", () => {
    const courses = [
      makeCourse({ id: "MATH-1300" }),
      makeCourse({
        id: "MATH-2300",
        prereqs: { type: "course", courseId: "MATH-1300" },
      }),
    ];

    const assignments = new Map([
      ["MATH-1300", "SP26"],
      ["MATH-2300", "FA26"],
    ]);

    const warnings = getCascadeWarnings(
      "MATH-1300", "SP26", "FA25", courses, sems, assignments
    );
    expect(warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Progress calculation
// ---------------------------------------------------------------------------

describe("calcProgress", () => {
  it("calculates complete_all progress", () => {
    const courses = [
      makeCourse({ id: "A", status: "completed" }),
      makeCourse({ id: "B", status: "in_progress" }),
      makeCourse({ id: "C", status: "not_started" }),
    ];
    const group: RequirementGroup = {
      id: "test",
      name: "Test",
      category: "Test",
      type: "complete_all",
      coursePool: ["A", "B", "C"],
    };

    const p = calcProgress(group, courses);
    expect(p.completed).toBe(1);
    expect(p.inProgress).toBe(1);
    expect(p.total).toBe(3);
    expect(p.pct).toBeCloseTo(1 / 3, 4);
  });

  it("calculates pick_n progress", () => {
    const courses = [
      makeCourse({ id: "A", status: "completed" }),
      makeCourse({ id: "B", status: "completed" }),
      makeCourse({ id: "C", status: "not_started" }),
      makeCourse({ id: "D", status: "not_started" }),
    ];
    const group: RequirementGroup = {
      id: "test",
      name: "Test",
      category: "Test",
      type: "pick_n",
      required: 2,
      coursePool: ["A", "B", "C", "D"],
    };

    const p = calcProgress(group, courses);
    expect(p.completed).toBe(2);
    expect(p.total).toBe(2); // required count, not pool size
    expect(p.pct).toBeCloseTo(1.0, 4);
  });

  it("calculates minimum_hours progress", () => {
    const courses = [
      makeCourse({ id: "A", status: "completed", credits: 3 }),
      makeCourse({ id: "B", status: "in_progress", credits: 4 }),
      makeCourse({ id: "C", status: "not_started", credits: 3 }),
    ];
    const group: RequirementGroup = {
      id: "test",
      name: "Test",
      category: "Test",
      type: "minimum_hours",
      requiredHours: 10,
      coursePool: ["A", "B", "C"],
    };

    const p = calcProgress(group, courses);
    expect(p.completed).toBe(3);
    expect(p.inProgress).toBe(4);
    expect(p.total).toBe(10);
    expect(p.pct).toBeCloseTo(0.3, 4);
  });

  it("W grade does not satisfy complete_all requirement even without minGrade", () => {
    const courses = [
      makeCourse({ id: "A", status: "completed", grade: "W" }),
    ];
    const group: RequirementGroup = {
      id: "test",
      name: "Test",
      category: "Test",
      type: "complete_all",
      coursePool: ["A"],
      // no minGrade set
    };

    const p = calcProgress(group, courses);
    expect(p.completed).toBe(0);
    expect(p.pct).toBe(0);
  });

  it("W grade does not satisfy minimum_hours requirement even without minGrade", () => {
    const courses = [
      makeCourse({ id: "A", status: "completed", grade: "W", credits: 3 }),
    ];
    const group: RequirementGroup = {
      id: "test",
      name: "Test",
      category: "Test",
      type: "minimum_hours",
      requiredHours: 3,
      coursePool: ["A"],
    };

    const p = calcProgress(group, courses);
    expect(p.completed).toBe(0);
    expect(p.pct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Solve target grade
// ---------------------------------------------------------------------------

describe("solveTargetGrade", () => {
  it("finds minimum grade needed for target GPA", () => {
    const courses = [
      makeCourse({ id: "A", credits: 3, grade: "A" }),  // 12 pts
      makeCourse({ id: "B", credits: 3, grade: "C" }),  // 6 pts
    ];
    const target = makeCourse({ id: "C", credits: 3, status: "in_progress" });

    // Current: 18pts/6cr = 3.0. Want 3.0 overall with 9 total credits.
    // Need: 3.0 * 9 - 18 = 9 pts in 3cr → 3.0/cr → B
    const result = solveTargetGrade(3.0, target, [...courses, target], new Map());
    expect(result.grade).toBe("B");
  });

  it("returns null when target is impossible", () => {
    const courses = [
      makeCourse({ id: "A", credits: 3, grade: "F" }),
      makeCourse({ id: "B", credits: 3, grade: "F" }),
    ];
    const target = makeCourse({ id: "C", credits: 3, status: "in_progress" });

    // Current: 0pts. Want 3.5 in 9 credits → need 31.5pts → 10.5/cr → impossible
    const result = solveTargetGrade(3.5, target, [...courses, target], new Map());
    expect(result.grade).toBeNull();
  });

  it("returns F when any grade achieves target", () => {
    const courses = [
      makeCourse({ id: "A", credits: 3, grade: "A" }),
      makeCourse({ id: "B", credits: 3, grade: "A" }),
    ];
    const target = makeCourse({ id: "C", credits: 3, status: "in_progress" });

    // Current: 24pts/6cr = 4.0. Want 2.0 in 9cr → need 18 - 24 = -6 → any grade works
    const result = solveTargetGrade(2.0, target, [...courses, target], new Map());
    expect(result.grade).toBe("F");
    expect(result.needed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Semester ordering
// ---------------------------------------------------------------------------

describe("semesterOrder / sortSemesters", () => {
  it("orders semesters chronologically", () => {
    const sems = [
      makeSemester({ id: "FA26" }),
      makeSemester({ id: "SP26" }),
      makeSemester({ id: "SU26" }),
      makeSemester({ id: "SP25" }),
    ];
    const sorted = sortSemesters(sems);
    expect(sorted.map((s) => s.id)).toEqual(["SP25", "SP26", "SU26", "FA26"]);
  });
});
