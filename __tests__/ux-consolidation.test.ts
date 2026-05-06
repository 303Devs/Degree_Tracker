import { describe, expect, it } from "vitest";
import { PRIMARY_NAV } from "@/lib/navigation";
import { getCourseLibraryMeta, isCourseLibraryVisible } from "@/lib/course-library";
import type { Course } from "@/lib/types";

function makeCourse(overrides: Partial<Course> & { id: string }): Course {
  return {
    id: overrides.id,
    number: overrides.id.replace("-", " "),
    name: "Test Course",
    credits: 3,
    prereqs: null,
    coreqs: null,
    status: "not_started",
    ...overrides,
  };
}

describe("303-40 UX consolidation", () => {
  it("uses the approved primary navigation only", () => {
    expect(PRIMARY_NAV.map((item) => item.label)).toEqual([
      "Upload",
      "Degree Plan",
      "Course Library",
      "GPA",
      "Settings",
    ]);
    expect(PRIMARY_NAV.map((item) => item.href)).toEqual([
      "/upload",
      "/degree-plan",
      "/course-library",
      "/gpa",
      "/settings",
    ]);

    const demotedLabels = [
      "Requirements",
      "Semester Planner",
      "Course Catalog",
      "Manage Courses",
      "Uncounted Courses",
    ];
    for (const label of demotedLabels) {
      expect(PRIMARY_NAV.some((item) => item.label === label)).toBe(false);
    }
  });

  it("derives Course Library source and counting flags without changing parser data", () => {
    expect(getCourseLibraryMeta(makeCourse({ id: "STAT-3100", source: "audit", grade: "A", status: "completed" }))).toMatchObject({
      source: "Audit",
      counting: "Counts",
    });
    expect(getCourseLibraryMeta(makeCourse({ id: "MATH-1300", source: "manual" }))).toMatchObject({
      source: "Manual",
    });
    expect(getCourseLibraryMeta(makeCourse({ id: "CSCI-3022", source: "enriched" }))).toMatchObject({
      source: "Catalog",
    });
    expect(getCourseLibraryMeta(makeCourse({ id: "STAT-4000", source: "catalog" }))).toMatchObject({
      source: "Catalog",
    });
    expect(getCourseLibraryMeta(makeCourse({ id: "W-1000", source: "audit", grade: "W", credits: 0, status: "completed" }))).toMatchObject({
      source: "Audit",
      counting: "Not counting",
    });
    expect(getCourseLibraryMeta(makeCourse({ id: "REPEAT-1000", source: "audit", countedTowardDegree: false, status: "completed", grade: "F" }))).toMatchObject({
      source: "Audit",
      counting: "Not counting",
    });
    expect(getCourseLibraryMeta(makeCourse({ id: "CSCI-9999", status: "not_started" }))).toMatchObject({
      source: "Catalog",
      counting: "Not planned",
    });
  });

  it("keeps uncounted courses in Course Library while hiding parser junk rows", () => {
    expect(isCourseLibraryVisible(makeCourse({ id: "CSCI-1200", countedTowardDegree: false }))).toBe(true);
    expect(isCourseLibraryVisible(makeCourse({ id: "BAD-0000" }))).toBe(false);
  });
});
