import { describe, expect, it } from "vitest";
import { buildPlannerBoardViewModel } from "../lib/planner-board-view";
import { validatePlan } from "../lib/planner-validation";
import type { Course, RequirementGroup, Semester } from "../lib/types";

function course(overrides: Partial<Course> & { id: string }): Course {
  return {
    id: overrides.id,
    number: overrides.id.replace("-", " "),
    name: `Course ${overrides.id}`,
    credits: 3,
    prereqs: null,
    coreqs: null,
    status: "not_started",
    ...overrides,
  };
}

function semester(overrides: Partial<Semester> & { id: string }): Semester {
  return {
    id: overrides.id,
    label: overrides.id,
    type: "fall",
    year: 2026,
    status: "planned",
    courses: [],
    ...overrides,
  };
}

function requirement(overrides: Partial<RequirementGroup> & { id: string }): RequirementGroup {
  return {
    id: overrides.id,
    name: overrides.id,
    category: "Test",
    type: "complete_all",
    coursePool: [],
    ...overrides,
  };
}

describe("buildPlannerBoardViewModel", () => {
  it("groups unplanned courses by blocked, requirement, and available context", () => {
    const courses = [
      course({ id: "MATH-1300", status: "not_started", semester: undefined }),
      course({ id: "MATH-2300", prereqs: { type: "course", courseId: "MATH-1300" } }),
      course({ id: "HIST-1000" }),
    ];
    const semesters = [semester({ id: "FA26" })];
    const requirements = [requirement({ id: "Quantitative", name: "Quantitative Reasoning", coursePool: ["MATH-1300"] })];
    const assignments = new Map(courses.map((item) => [item.id, "unplanned"]));
    const validation = validatePlan(courses, semesters, requirements, assignments);

    const result = buildPlannerBoardViewModel({ courses, semesters, requirements, assignments, validation });

    expect(result.courseGroups.find((group) => group.id === "blocked")?.courses.map((item) => item.course.id)).toEqual(["MATH-2300"]);
    expect(result.courseGroups.find((group) => group.id === "required")?.courses.map((item) => item.course.id)).toEqual(["MATH-1300"]);
    expect(result.courseGroups.find((group) => group.id === "available")?.courses.map((item) => item.course.id)).toEqual(["HIST-1000"]);
  });

  it("computes semester credit totals and conflict counts", () => {
    const courses = [
      course({ id: "MATH-1300", semester: "SP26", status: "planned", credits: 4 }),
      course({ id: "MATH-2300", semester: "SP26", status: "planned", credits: 4, prereqs: { type: "course", courseId: "MATH-1300" } }),
    ];
    const semesters = [semester({ id: "SP26", label: "Spring 2026" })];
    const assignments = new Map(courses.map((item) => [item.id, item.semester ?? "unplanned"]));
    const validation = validatePlan(courses, semesters, [], assignments);

    const result = buildPlannerBoardViewModel({ courses, semesters, requirements: [], assignments, validation });

    expect(result.semesterSummaries[0]).toMatchObject({ credits: 8, courseCount: 2, loadTone: "attention", conflicts: 2 });
    expect(result.summary.conflictCount).toBe(2);
  });

  it("keeps completed semesters in summaries for history visibility controls", () => {
    const courses = [course({ id: "CSCI-1000", semester: "FA25", status: "completed" })];
    const semesters = [semester({ id: "FA25", status: "completed" }), semester({ id: "SP26" })];
    const assignments = new Map([["CSCI-1000", "FA25"]]);
    const validation = validatePlan(courses, semesters, [], assignments);

    const result = buildPlannerBoardViewModel({ courses, semesters, requirements: [], assignments, validation });

    expect(result.semesterSummaries.map((item) => item.semester.id)).toEqual(["FA25", "SP26"]);
  });
});
