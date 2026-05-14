import fs from "fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return fs.readFileSync(path, "utf-8");
}

describe("Course Library editing UI source", () => {
  it("wires Course Library to add/edit sheet entry points", () => {
    const source = read("components/CourseLibraryWorkspace.tsx");

    expect(source).toContain("Add manual course");
    expect(source).toContain("openEditSheet(course)");
    expect(source).toContain("<CourseEditSheet");
    expect(source).toContain("onSaved={upsertCourse}");
    expect(source).toContain("onDeleted={removeCourse}");
  });

  it("uses Phase 5B course edit API endpoints from the sheet", () => {
    const source = read("components/CourseEditSheet.tsx");

    expect(source).toContain("/api/courses");
    expect(source).toContain("PATCH");
    expect(source).toContain("DELETE");
    expect(source).toContain("/reset");
  });

  it("renders audit reset controls and blocked delete explanation", () => {
    const source = read("components/CourseEditSheet.tsx");

    expect(source).toContain("Audit course controls");
    expect(source).toContain("Reset field");
    expect(source).toContain("Reset all");
    expect(source).toContain("Delete disabled for imported courses");
  });

  it("renders manual delete confirmation flow", () => {
    const source = read("components/CourseEditSheet.tsx");

    expect(source).toContain("window.confirm");
    expect(source).toContain("Delete manual course");
  });

  it("keeps prereq/coreq editing out of the course form payload", () => {
    const source = read("components/CourseForm.tsx");
    const payloadStart = source.indexOf("export function toCoursePayload");
    const payloadEnd = source.indexOf("export function CourseForm");
    const payloadSource = source.slice(payloadStart, payloadEnd);

    expect(payloadSource).not.toContain("prereqs");
    expect(payloadSource).not.toContain("coreqs");
    expect(payloadSource).not.toContain("source");
    expect(payloadSource).not.toContain("manuallyAdded");
  });
});
