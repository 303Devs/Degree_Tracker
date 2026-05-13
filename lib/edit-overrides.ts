import type { Course, EntityLocalState, EntityProvenance, EntityType, FieldOverride, ManualEntity, RequirementGroup } from "./types";

export interface EditableDataSet {
  courses: Course[];
  requirements: RequirementGroup[];
}

export interface EffectiveDataInput extends EditableDataSet {
  overrides?: FieldOverride[];
  manualEntities?: ManualEntity[];
  localStates?: EntityLocalState[];
}

export interface EffectiveDataResult extends EditableDataSet {
  overrides: FieldOverride[];
  manualEntities: ManualEntity[];
  localStates: EntityLocalState[];
}

export type DeleteProtectionResult =
  | { allowed: true; mode: "delete" }
  | { allowed: false; mode: "block" | "local-state"; reason: string };

const AUDIT_DELETE_REASON = "Audit-sourced entities cannot be destructively deleted; hide or exclude them instead.";

export function defaultCourseProvenance(course: Course, auditImportId?: string): EntityProvenance {
  const source = course.manuallyAdded ? "manual" : course.source ?? "audit";

  return {
    source,
    auditImportId: source === "audit" ? auditImportId : undefined,
  };
}

export function defaultRequirementProvenance(_requirement: RequirementGroup, auditImportId?: string): EntityProvenance {
  return {
    source: "audit",
    auditImportId,
  };
}

export function buildEffectiveData(input: EffectiveDataInput): EffectiveDataResult {
  const overrides = input.overrides ?? [];
  const manualEntities = input.manualEntities ?? [];
  const localStates = input.localStates ?? [];

  const courses = applyEntityOverrides(
    [
      ...input.courses.map((course) => ({ ...course })),
      ...manualEntities
        .filter((entity): entity is ManualEntity & { entityType: "course"; value: Course } => entity.entityType === "course")
        .map((entity) => ({ ...entity.value, manuallyAdded: true, source: "manual" as const })),
    ],
    "course",
    overrides,
    localStates
  );

  const requirements = applyEntityOverrides(
    [
      ...input.requirements.map((requirement) => ({ ...requirement })),
      ...manualEntities
        .filter((entity): entity is ManualEntity & { entityType: "requirement"; value: RequirementGroup } => entity.entityType === "requirement")
        .map((entity) => ({ ...entity.value })),
    ],
    "requirement",
    overrides,
    localStates
  );

  return { courses, requirements, overrides, manualEntities, localStates };
}

export function applyOverrides<T extends { id: string }>(
  entities: T[],
  entityType: EntityType,
  overrides: FieldOverride[],
  localStates: EntityLocalState[] = []
): T[] {
  return applyEntityOverrides(entities.map((entity) => ({ ...entity })), entityType, overrides, localStates);
}

export function resetFieldOverride(overrides: FieldOverride[], entityType: EntityType, entityId: string, field: string): FieldOverride[] {
  return overrides.filter((override) => !(override.entityType === entityType && override.entityId === entityId && override.field === field));
}

export function resetEntityOverrides(overrides: FieldOverride[], entityType: EntityType, entityId: string): FieldOverride[] {
  return overrides.filter((override) => !(override.entityType === entityType && override.entityId === entityId));
}

export function canDestructivelyDelete(provenance: EntityProvenance | undefined): DeleteProtectionResult {
  if (!provenance || provenance.source === "audit") {
    return { allowed: false, mode: "local-state", reason: AUDIT_DELETE_REASON };
  }
  if (provenance.source === "manual") {
    return { allowed: true, mode: "delete" };
  }
  return { allowed: false, mode: "block", reason: `Entities sourced from ${provenance.source} cannot be destructively deleted in Phase 5A.` };
}

function applyEntityOverrides<T extends { id: string }>(
  entities: T[],
  entityType: EntityType,
  overrides: FieldOverride[],
  localStates: EntityLocalState[]
): T[] {
  const byId = new Map(entities.map((entity) => [entity.id, { ...entity }]));

  for (const override of overrides) {
    if (override.entityType !== entityType) continue;
    const entity = byId.get(override.entityId);
    if (!entity) continue;
    (entity as Record<string, unknown>)[override.field] = cloneValue(override.value);
  }

  for (const localState of localStates) {
    if (localState.entityType !== entityType) continue;
    const entity = byId.get(localState.entityId);
    if (!entity) continue;
    if (localState.hidden || localState.excluded) {
      (entity as Record<string, unknown>).hidden = localState.hidden;
      (entity as Record<string, unknown>).excluded = localState.excluded;
      (entity as Record<string, unknown>).localStateReason = localState.reason;
    }
  }

  return [...byId.values()];
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
