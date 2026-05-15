import { buildEffectiveData } from "./edit-overrides";
import type { Course, EntityLocalState, FieldOverride, ManualEntity, RequirementGroup } from "./types";

export type ReimportConflictEntityType = "course" | "requirement";
export type ReimportConflictType =
  | "course_field"
  | "requirement_field"
  | "requirement_course_pool"
  | "requirement_selected_courses";

export interface ReimportConflict {
  id: string;
  type: ReimportConflictType;
  entityType: ReimportConflictEntityType;
  entityId: string;
  field: string;
  currentBaseValue: unknown;
  currentEffectiveValue: unknown;
  incomingAuditValue: unknown;
  overrideId: string;
  resolutionOptions: ["keep_edit", "use_new_audit"];
}

export interface ReimportManualEntityImpact {
  id: string;
  entityType: "course" | "requirement";
  entityId: string;
  decision: "preserve_unless_reset_all";
}

export interface ReimportLocalStateImpact {
  entityType: EntityLocalState["entityType"];
  entityId: string;
  decision: "preserve" | "reset_if_reset_all";
  reason: string;
}

export interface ReimportDecisionModel {
  preserveLocalEdits: {
    conflictsRequireReview: boolean;
    manualEntities: "preserve";
    dashboardActionLocalState: "preserve";
    destructive: false;
  };
  resetAllLocalEdits: {
    conflictsRequireReview: false;
    manualEntities: "remove_after_explicit_confirmation";
    dashboardActionLocalState: "preserve";
    destructive: true;
    warning: string;
  };
}

export interface ReimportTrustPreviewInput {
  currentCourses: Course[];
  currentRequirements: RequirementGroup[];
  incomingCourses: Course[];
  incomingRequirements: RequirementGroup[];
  editState: {
    overrides?: FieldOverride[];
    manualEntities?: ManualEntity[];
    localStates?: EntityLocalState[];
  };
}

export type ReimportConflictResolution = "keep_edit" | "use_new_audit";
export type ReimportApplyMode = "preserve" | "reset_all";

export interface ReimportConflictDecision {
  conflictId: string;
  resolution: ReimportConflictResolution;
}

export interface ReimportTrustPreview {
  hasLocalEditState: boolean;
  summary: {
    overrides: number;
    manualEntities: number;
    localStates: number;
    dashboardActionLocalStates: number;
  };
  conflicts: ReimportConflict[];
  manualEntityImpacts: ReimportManualEntityImpact[];
  localStateImpacts: ReimportLocalStateImpact[];
  decisions: ReimportDecisionModel;
}

const COURSE_FIELDS: string[] = [
  "number",
  "name",
  "description",
  "credits",
  "status",
  "grade",
  "semester",
  "notes",
  "countedTowardDegree",
  "countsTowardDegree",
  "countsTowardGPA",
  "countsTowardEarnedHours",
  "excludeReason",
  "prereqs",
  "coreqs",
];

const REQUIREMENT_FIELDS: string[] = [
  "name",
  "category",
  "type",
  "required",
  "requiredHours",
  "coursePool",
  "selectedCourses",
  "notes",
  "minGrade",
];

export function buildReimportTrustPreview(input: ReimportTrustPreviewInput): ReimportTrustPreview {
  const overrides = input.editState.overrides ?? [];
  const manualEntities = input.editState.manualEntities ?? [];
  const localStates = input.editState.localStates ?? [];
  const effective = buildEffectiveData({
    courses: input.currentCourses,
    requirements: input.currentRequirements,
    overrides,
    manualEntities,
    localStates,
  });

  const dashboardActionLocalStates = localStates.filter((state) => state.entityType === "dashboardAction").length;
  return {
    hasLocalEditState: hasReimportLocalEditState(input.editState),
    summary: {
      overrides: overrides.length,
      manualEntities: manualEntities.length,
      localStates: localStates.length,
      dashboardActionLocalStates,
    },
    conflicts: [
      ...detectCourseOverrideConflicts(input.currentCourses, effective.courses, input.incomingCourses, overrides),
      ...detectRequirementOverrideConflicts(input.currentRequirements, effective.requirements, input.incomingRequirements, overrides),
    ],
    manualEntityImpacts: manualEntities.map(toManualEntityImpact),
    localStateImpacts: localStates.map(toLocalStateImpact),
    decisions: buildReimportDecisionModel(),
  };
}

export function hasReimportLocalEditState(editState: ReimportTrustPreviewInput["editState"]): boolean {
  return (editState.overrides?.length ?? 0) > 0 || (editState.manualEntities?.length ?? 0) > 0 || (editState.localStates?.length ?? 0) > 0;
}

export function applyReimportEditStateDecision(
  editState: Required<ReimportTrustPreviewInput["editState"]>,
  mode: ReimportApplyMode,
  decisions: ReimportConflictDecision[] = []
): Required<ReimportTrustPreviewInput["editState"]> {
  if (mode === "reset_all") {
    return {
      overrides: [],
      manualEntities: [],
      localStates: editState.localStates.filter((state) => state.entityType === "dashboardAction"),
    };
  }

  const useNewAudit = new Set(decisions.filter((decision) => decision.resolution === "use_new_audit").map((decision) => decision.conflictId));
  return {
    overrides: editState.overrides.filter((override) => !useNewAudit.has(conflictId(override.entityType, override.entityId, override.field))),
    manualEntities: [...editState.manualEntities],
    localStates: [...editState.localStates],
  };
}

export function buildReimportDecisionModel(): ReimportDecisionModel {
  return {
    preserveLocalEdits: {
      conflictsRequireReview: true,
      manualEntities: "preserve",
      dashboardActionLocalState: "preserve",
      destructive: false,
    },
    resetAllLocalEdits: {
      conflictsRequireReview: false,
      manualEntities: "remove_after_explicit_confirmation",
      dashboardActionLocalState: "preserve",
      destructive: true,
      warning: "This will permanently remove local course and requirement edits and manual courses/requirements. Dismissed and snoozed dashboard next actions are preserved.",
    },
  };
}

function detectCourseOverrideConflicts(
  currentCourses: Course[],
  effectiveCourses: Course[],
  incomingCourses: Course[],
  overrides: FieldOverride[]
): ReimportConflict[] {
  const currentById = new Map(currentCourses.map((course) => [course.id, course]));
  const effectiveById = new Map(effectiveCourses.map((course) => [course.id, course]));
  const incomingById = new Map(incomingCourses.map((course) => [course.id, course]));

  return overrides
    .filter((override) => override.entityType === "course" && COURSE_FIELDS.includes(override.field))
    .flatMap((override) => {
      const incoming = incomingById.get(override.entityId);
      const effective = effectiveById.get(override.entityId);
      if (!incoming || !effective) return [];
      const incomingAuditValue = valueAt(incoming, override.field);
      const currentEffectiveValue = valueAt(effective, override.field);
      if (sameValue(incomingAuditValue, currentEffectiveValue)) return [];
      return [{
        id: conflictId("course", override.entityId, override.field),
        type: "course_field" as const,
        entityType: "course" as const,
        entityId: override.entityId,
        field: override.field,
        currentBaseValue: valueAt(currentById.get(override.entityId), override.field),
        currentEffectiveValue,
        incomingAuditValue,
        overrideId: override.id,
        resolutionOptions: ["keep_edit", "use_new_audit"] as ["keep_edit", "use_new_audit"],
      }];
    });
}

function detectRequirementOverrideConflicts(
  currentRequirements: RequirementGroup[],
  effectiveRequirements: RequirementGroup[],
  incomingRequirements: RequirementGroup[],
  overrides: FieldOverride[]
): ReimportConflict[] {
  const currentById = new Map(currentRequirements.map((requirement) => [requirement.id, requirement]));
  const effectiveById = new Map(effectiveRequirements.map((requirement) => [requirement.id, requirement]));
  const incomingById = new Map(incomingRequirements.map((requirement) => [requirement.id, requirement]));

  return overrides
    .filter((override) => override.entityType === "requirement" && REQUIREMENT_FIELDS.includes(override.field))
    .flatMap((override) => {
      const incoming = incomingById.get(override.entityId);
      const effective = effectiveById.get(override.entityId);
      if (!incoming || !effective) return [];
      const incomingAuditValue = valueAt(incoming, override.field);
      const currentEffectiveValue = valueAt(effective, override.field);
      if (sameValue(incomingAuditValue, currentEffectiveValue)) return [];
      return [{
        id: conflictId("requirement", override.entityId, override.field),
        type: requirementConflictType(override.field),
        entityType: "requirement" as const,
        entityId: override.entityId,
        field: override.field,
        currentBaseValue: valueAt(currentById.get(override.entityId), override.field),
        currentEffectiveValue,
        incomingAuditValue,
        overrideId: override.id,
        resolutionOptions: ["keep_edit", "use_new_audit"] as ["keep_edit", "use_new_audit"],
      }];
    });
}

function toManualEntityImpact(entity: ManualEntity): ReimportManualEntityImpact {
  return {
    id: entity.id,
    entityType: entity.entityType,
    entityId: entity.value.id,
    decision: "preserve_unless_reset_all",
  };
}

function toLocalStateImpact(state: EntityLocalState): ReimportLocalStateImpact {
  if (state.entityType === "dashboardAction") {
    return {
      entityType: state.entityType,
      entityId: state.entityId,
      decision: "preserve",
      reason: "Dismissed and snoozed dashboard next actions survive re-upload.",
    };
  }
  return {
    entityType: state.entityType,
    entityId: state.entityId,
    decision: "reset_if_reset_all",
    reason: "Entity local state is preserved with local edits and removed only by explicit reset-all.",
  };
}

function requirementConflictType(field: string): ReimportConflictType {
  if (field === "coursePool") return "requirement_course_pool";
  if (field === "selectedCourses") return "requirement_selected_courses";
  return "requirement_field";
}

function conflictId(entityType: ReimportConflictEntityType, entityId: string, field: string): string {
  return `${entityType}:${entityId}:${field}`;
}

function valueAt(entity: object | undefined, field: string): unknown {
  return entity ? (entity as Record<string, unknown>)[field] : undefined;
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
