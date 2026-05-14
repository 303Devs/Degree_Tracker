import fs from "fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return fs.readFileSync(path, "utf-8");
}

describe("Planner course editing UI source", () => {
  it("adds planner course edit entry points using the existing course edit sheet", () => {
    const source = read("components/PlannerWorkspace.tsx");

    expect(source).toContain('import { CourseEditSheet } from "./CourseEditSheet"');
    expect(source).toContain("Edit course");
    expect(source).toContain("onEditCourse={setEditingCourse}");
    expect(source).toContain("<CourseEditSheet");
  });

  it("refreshes planner course assignments after course edit sheet changes", () => {
    const source = read("components/PlannerWorkspace.tsx");

    expect(source).toContain("const refreshCourses = useCallback");
    expect(source).toContain('fetch("/api/courses")');
    expect(source).toContain("setAssignments(map)");
    expect(source).toContain("onSaved={async () =>");
    expect(source).toContain("onDeleted={async () =>");
  });
});
