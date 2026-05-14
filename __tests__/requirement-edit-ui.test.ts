import fs from "fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return fs.readFileSync(path, "utf-8");
}

describe("Requirement editing UI source", () => {
  it("wires Audit Plan requirements to add/edit sheet entry points", () => {
    const source = read("components/RequirementsWorkspace.tsx");

    expect(source).toContain("Add manual requirement");
    expect(source).toContain("openEditSheet");
    expect(source).toContain("<RequirementEditSheet");
    expect(source).toContain("onSaved={upsertRequirement}");
    expect(source).toContain("onDeleted={removeRequirement}");
  });

  it("uses Phase 5D requirement edit API endpoints from the sheet", () => {
    const source = read("components/RequirementEditSheet.tsx");

    expect(source).toContain("/api/requirements");
    expect(source).toContain("PATCH");
    expect(source).toContain("DELETE");
    expect(source).toContain("/reset");
  });

  it("renders imported reset controls and blocked delete explanation", () => {
    const source = read("components/RequirementEditSheet.tsx");

    expect(source).toContain("Imported requirement controls");
    expect(source).toContain("Reset field");
    expect(source).toContain("Reset all");
    expect(source).toContain("Delete disabled for imported requirements");
  });

  it("renders manual delete confirmation flow", () => {
    const source = read("components/RequirementEditSheet.tsx");

    expect(source).toContain("window.confirm");
    expect(source).toContain("Delete manual requirement");
  });

  it("keeps prereq/coreq editing out of the requirement form payload", () => {
    const source = read("components/RequirementForm.tsx");
    const payloadStart = source.indexOf("export function toRequirementPayload");
    const payloadEnd = source.indexOf("export function RequirementForm");
    const payloadSource = source.slice(payloadStart, payloadEnd);

    expect(payloadSource).toContain("coursePool");
    expect(payloadSource).toContain("selectedCourses");
    expect(payloadSource).not.toContain("prereq");
    expect(payloadSource).not.toContain("coreq");
    expect(payloadSource).not.toContain("provenance");
  });
});
