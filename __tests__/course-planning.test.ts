import { describe, expect, it } from "vitest";
import { applyCourseSemester, buildCourseSemesterPatch } from "../lib/course-planning";
import type { Course } from "../lib/types";

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "STAT-3100",
    number: "STAT 3100",
    name: "Applied Probability",
    credits: 3,
    prereqs: null,
    coreqs: null,
    status: "not_started",
    ...overrides,
  };
}

describe("course planning semester updates", () => {
  it("promotes an unstarted course to planned when assigning a semester", () => {
    const course = makeCourse();

    expect(applyCourseSemester(course, "FA26")).toMatchObject({
      semester: "FA26",
      status: "planned",
    });
    expect(buildCourseSemesterPatch(course, "FA26")).toEqual({
      semester: "FA26",
      status: "planned",
    });
  });

  it("returns a planned course to not-started when unplanning it", () => {
    const course = makeCourse({ status: "planned", semester: "FA26" });

    expect(applyCourseSemester(course, null)).toMatchObject({
      semester: undefined,
      status: "not_started",
    });
    expect(buildCourseSemesterPatch(course, null)).toEqual({
      semester: null,
      status: "not_started",
    });
  });

  it("preserves completed and active statuses when semester metadata changes", () => {
    expect(buildCourseSemesterPatch(makeCourse({ status: "completed" }), "FA26").status).toBe("completed");
    expect(buildCourseSemesterPatch(makeCourse({ status: "in_progress" }), "FA26").status).toBe("in_progress");
    expect(buildCourseSemesterPatch(makeCourse({ status: "registered" }), null).status).toBe("registered");
  });
});
