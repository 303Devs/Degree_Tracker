import { describe, expect, it } from "vitest";
import { applyReimportEditStateDecision, buildReimportTrustPreview } from "../lib/reimport-trust";
import type { Course, FieldOverride, ManualEntity, RequirementGroup } from "../lib/types";

function course(overrides: Partial<Course> & { id: string }): Course {
  return {
    id: overrides.id,
    number: overrides.number ?? overrides.id.replace("-", " "),
    name: overrides.name ?? `Course ${overrides.id}`,
    credits: overrides.credits ?? 3,
    prereqs: overrides.prereqs ?? null,
    coreqs: overrides.coreqs ?? null,
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

function override(overrides: Partial<FieldOverride> & Pick<FieldOverride, "entityType" | "entityId" | "field" | "value">): FieldOverride {
  return {
    id: `${overrides.entityType}-${overrides.entityId}-${overrides.field}`,
    baseSource: "audit",
    baseValue: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("upload re-import trust foundation", () => {
  it("detects course field conflicts when incoming audit differs from the edited effective value", () => {
    const preview = buildReimportTrustPreview({
      currentCourses: [course({ id: "CSCI-1300", name: "Old audit name", credits: 3 })],
      currentRequirements: [],
      incomingCourses: [course({ id: "CSCI-1300", name: "New audit name", credits: 4 })],
      incomingRequirements: [],
      editState: {
        overrides: [
          override({ entityType: "course", entityId: "CSCI-1300", field: "name", baseValue: "Old audit name", value: "My edited name" }),
          override({ entityType: "course", entityId: "CSCI-1300", field: "credits", baseValue: 3, value: 4 }),
        ],
      },
    });

    expect(preview.conflicts).toEqual([
      expect.objectContaining({
        id: "course:CSCI-1300:name",
        type: "course_field",
        entityType: "course",
        field: "name",
        currentBaseValue: "Old audit name",
        currentEffectiveValue: "My edited name",
        incomingAuditValue: "New audit name",
        resolutionOptions: ["keep_edit", "use_new_audit"],
      }),
    ]);
  });

  it("detects requirement field, coursePool, and selectedCourses conflicts", () => {
    const currentRequirement = requirement({
      id: "REQ-1",
      name: "Old requirement",
      coursePool: ["CSCI-1300", "CSCI-2270"],
      selectedCourses: ["CSCI-1300"],
    });
    const incomingRequirement = requirement({
      id: "REQ-1",
      name: "New requirement",
      coursePool: ["CSCI-2270", "CSCI-2400"],
      selectedCourses: ["CSCI-2400"],
    });

    const preview = buildReimportTrustPreview({
      currentCourses: [],
      currentRequirements: [currentRequirement],
      incomingCourses: [],
      incomingRequirements: [incomingRequirement],
      editState: {
        overrides: [
          override({ entityType: "requirement", entityId: "REQ-1", field: "name", baseValue: "Old requirement", value: "My requirement" }),
          override({ entityType: "requirement", entityId: "REQ-1", field: "coursePool", baseValue: ["CSCI-1300", "CSCI-2270"], value: ["CSCI-1300"] }),
          override({ entityType: "requirement", entityId: "REQ-1", field: "selectedCourses", baseValue: ["CSCI-1300"], value: ["CSCI-2270"] }),
        ],
      },
    });

    expect(preview.conflicts.map((conflict) => [conflict.id, conflict.type, conflict.currentEffectiveValue, conflict.incomingAuditValue])).toEqual([
      ["requirement:REQ-1:name", "requirement_field", "My requirement", "New requirement"],
      ["requirement:REQ-1:coursePool", "requirement_course_pool", ["CSCI-1300"], ["CSCI-2270", "CSCI-2400"]],
      ["requirement:REQ-1:selectedCourses", "requirement_selected_courses", ["CSCI-2270"], ["CSCI-2400"]],
    ]);
  });

  it("models preserve-vs-reset decisions without performing destructive reset", () => {
    const manualCourse: ManualEntity = {
      id: "manual-course-MATH-2400",
      entityType: "course",
      value: course({ id: "MATH-2400", name: "Manual math", source: "manual", manuallyAdded: true }),
      provenance: { source: "manual" },
    };
    const manualRequirement: ManualEntity = {
      id: "manual-requirement-REQ-MANUAL",
      entityType: "requirement",
      value: requirement({ id: "REQ-MANUAL", name: "Manual requirement", coursePool: ["MATH-2400"] }),
      provenance: { source: "manual" },
    };
    const editState = {
      overrides: [override({ entityType: "course", entityId: "CSCI-1300", field: "name", value: "Edited" })],
      manualEntities: [manualCourse, manualRequirement],
      localStates: [
        { entityType: "dashboardAction" as const, entityId: "remaining-REQ-1", dismissed: true, updatedAt: "2026-01-01T00:00:00.000Z" },
        { entityType: "course" as const, entityId: "CSCI-1300", hidden: true, updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };

    const preview = buildReimportTrustPreview({
      currentCourses: [course({ id: "CSCI-1300", name: "Base" })],
      currentRequirements: [],
      incomingCourses: [course({ id: "CSCI-1300", name: "Incoming" })],
      incomingRequirements: [],
      editState,
    });

    expect(preview.manualEntityImpacts).toEqual([
      { id: "manual-course-MATH-2400", entityType: "course", entityId: "MATH-2400", decision: "preserve_unless_reset_all" },
      { id: "manual-requirement-REQ-MANUAL", entityType: "requirement", entityId: "REQ-MANUAL", decision: "preserve_unless_reset_all" },
    ]);
    expect(preview.localStateImpacts).toEqual([
      expect.objectContaining({ entityType: "dashboardAction", entityId: "remaining-REQ-1", decision: "preserve" }),
      expect.objectContaining({ entityType: "course", entityId: "CSCI-1300", decision: "reset_if_reset_all" }),
    ]);
    expect(preview.decisions.preserveLocalEdits).toMatchObject({ destructive: false, manualEntities: "preserve", dashboardActionLocalState: "preserve" });
    expect(preview.decisions.resetAllLocalEdits).toMatchObject({ destructive: true, manualEntities: "remove_after_explicit_confirmation", dashboardActionLocalState: "preserve" });

    expect(editState.manualEntities).toHaveLength(2);
    expect(editState.localStates).toHaveLength(2);
    expect(editState.overrides).toHaveLength(1);
  });

  it("applies preserve conflict decisions by removing only overrides resolved to new audit", () => {
    const editState = {
      overrides: [
        override({ entityType: "course", entityId: "CSCI-1300", field: "name", value: "Edited name" }),
        override({ entityType: "requirement", entityId: "REQ-1", field: "coursePool", value: ["CSCI-1300"] }),
      ],
      manualEntities: [],
      localStates: [{ entityType: "dashboardAction" as const, entityId: "remaining-REQ-1", dismissed: true, updatedAt: "2026-01-01T00:00:00.000Z" }],
    };

    const next = applyReimportEditStateDecision(editState, "preserve", [
      { conflictId: "course:CSCI-1300:name", resolution: "use_new_audit" },
      { conflictId: "requirement:REQ-1:coursePool", resolution: "keep_edit" },
    ]);

    expect(next.overrides).toEqual([expect.objectContaining({ entityType: "requirement", entityId: "REQ-1", field: "coursePool" })]);
    expect(next.localStates).toEqual(editState.localStates);
  });

  it("models explicit reset-all by clearing edits and manual entities while preserving dashboard action state", () => {
    const editState = {
      overrides: [override({ entityType: "course", entityId: "CSCI-1300", field: "name", value: "Edited name" })],
      manualEntities: [{
        id: "manual-course-MATH-2400",
        entityType: "course" as const,
        value: course({ id: "MATH-2400", source: "manual", manuallyAdded: true }),
        provenance: { source: "manual" as const },
      }],
      localStates: [
        { entityType: "dashboardAction" as const, entityId: "remaining-REQ-1", dismissed: true, updatedAt: "2026-01-01T00:00:00.000Z" },
        { entityType: "course" as const, entityId: "CSCI-1300", hidden: true, updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };

    const next = applyReimportEditStateDecision(editState, "reset_all");

    expect(next.overrides).toEqual([]);
    expect(next.manualEntities).toEqual([]);
    expect(next.localStates).toEqual([expect.objectContaining({ entityType: "dashboardAction", entityId: "remaining-REQ-1" })]);
  });
});
