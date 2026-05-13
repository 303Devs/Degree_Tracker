import { describe, expect, it } from "vitest";
import type { Course, FieldOverride, ManualEntity, RequirementGroup } from "../lib/types";
import {
  applyOverrides,
  buildEffectiveData,
  canDestructivelyDelete,
  defaultCourseProvenance,
  defaultRequirementProvenance,
  resetEntityOverrides,
  resetFieldOverride,
} from "../lib/edit-overrides";

function course(overrides: Partial<Course> & { id: string }): Course {
  return {
    id: overrides.id,
    number: overrides.number ?? overrides.id.replace("-", " "),
    name: overrides.name ?? `Course ${overrides.id}`,
    credits: overrides.credits ?? 3,
    prereqs: null,
    coreqs: null,
    status: overrides.status ?? "not_started",
    source: overrides.source ?? "audit",
    ...overrides,
  };
}

function requirement(overrides: Partial<RequirementGroup> & { id: string }): RequirementGroup {
  return {
    id: overrides.id,
    name: overrides.name ?? `Requirement ${overrides.id}`,
    category: overrides.category ?? "Major",
    type: overrides.type ?? "complete_all",
    coursePool: overrides.coursePool ?? [],
    ...overrides,
  };
}

function override(field: string, value: unknown, entityId = "CSCI-1300"): FieldOverride {
  return {
    id: `override-${field}`,
    entityType: "course",
    entityId,
    field,
    value,
    baseValue: undefined,
    baseSource: "audit",
    createdAt: "2026-05-13T00:00:00.000Z",
    updatedAt: "2026-05-13T00:00:00.000Z",
  };
}

describe("editable data foundation", () => {
  it("keeps effective data identical when there are zero overrides or manual entities", () => {
    const courses = [course({ id: "CSCI-1300", name: "Computer Science 1" })];
    const requirements = [requirement({ id: "REQ-1", coursePool: ["CSCI-1300"] })];

    const effective = buildEffectiveData({ courses, requirements });

    expect(effective.courses).toEqual(courses);
    expect(effective.requirements).toEqual(requirements);
    expect(effective.overrides).toEqual([]);
    expect(effective.manualEntities).toEqual([]);
  });

  it("applies field overrides without mutating audit base records", () => {
    const base = [course({ id: "CSCI-1300", credits: 3, name: "Computer Science 1" })];

    const effective = applyOverrides(base, "course", [override("credits", 4), override("name", "Intro CS")]);

    expect(effective[0].credits).toBe(4);
    expect(effective[0].name).toBe("Intro CS");
    expect(base[0].credits).toBe(3);
    expect(base[0].name).toBe("Computer Science 1");
  });

  it("resets one field override or all entity overrides by removing override records", () => {
    const overrides = [override("credits", 4), override("name", "Intro CS"), override("status", "planned", "MATH-1300")];

    expect(resetFieldOverride(overrides, "course", "CSCI-1300", "credits")).toEqual([overrides[1], overrides[2]]);
    expect(resetEntityOverrides(overrides, "course", "CSCI-1300")).toEqual([overrides[2]]);
  });

  it("includes manual courses and requirements in the effective data set", () => {
    const manualCourse = course({ id: "PHYS-2170", name: "Foundations of Modern Physics", source: "manual", manuallyAdded: true });
    const manualRequirement = requirement({ id: "MANUAL-REQ", name: "Manual elective", coursePool: ["PHYS-2170"] });
    const manualEntities: ManualEntity[] = [
      { id: "manual-course", entityType: "course", value: manualCourse, provenance: { source: "manual" } },
      { id: "manual-req", entityType: "requirement", value: manualRequirement, provenance: { source: "manual" } },
    ];

    const effective = buildEffectiveData({ courses: [], requirements: [], manualEntities });

    expect(effective.courses).toEqual([manualCourse]);
    expect(effective.requirements).toEqual([manualRequirement]);
  });

  it("provides default provenance for existing audit and manual data", () => {
    expect(defaultCourseProvenance(course({ id: "CSCI-1300", source: "audit" }), "import-1")).toEqual({
      source: "audit",
      auditImportId: "import-1",
    });
    expect(defaultCourseProvenance(course({ id: "MANUAL-1", source: "manual", manuallyAdded: true }), "import-1")).toEqual({
      source: "manual",
      auditImportId: undefined,
    });
    expect(defaultRequirementProvenance(requirement({ id: "REQ-1" }), "import-1")).toEqual({
      source: "audit",
      auditImportId: "import-1",
    });
  });

  it("blocks destructive delete for audit-sourced entities and allows manual deletes", () => {
    expect(canDestructivelyDelete({ source: "audit" })).toEqual({
      allowed: false,
      mode: "local-state",
      reason: "Audit-sourced entities cannot be destructively deleted; hide or exclude them instead.",
    });
    expect(canDestructivelyDelete({ source: "manual" })).toEqual({ allowed: true, mode: "delete" });
  });
});
