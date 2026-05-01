# Plan Comparison Type Revision

**Version:** 1.0  
**Date:** April 30, 2026  
**Scope:** Phase 3 Task 6 - Comparison Engine Contract

---

## Purpose

This document defines the concrete `PlanComparison` contract for the Task 6 comparison engine.

The goal is to remove naming ambiguity before implementation starts.

This is a **type/design contract**, not a recommendation system, not a UI contract, and not an optimization layer.

---

## Design principles

1. **Canonical plan state stays upstream**
   - `PlanVariant.semesters` remains the only source of truth for plan state.

2. **Comparison output must be explainable**
   - Every field should map to something a user or reviewer can understand.

3. **Moves are not add/remove**
   - A moved course is a distinct case.

4. **Diffs should be symmetric and explicit**
   - Prefer `onlyInA` / `onlyInB` over vague `added` / `removed` labels.

5. **Validation issues must not be hidden**
   - Invalid plans should block comparison.

---

## Recommended type contract

```ts
export type SemesterId = string;
export type CourseId = string;
export type PlanId = string;
export type RiskLevel = "ok" | "warning" | "blocked";

export interface PlanComparisonResult {
  success: boolean;
  comparison?: PlanComparison;
  issues: PlanValidationIssue[];
}

export interface PlanComparison {
  planA: PlanComparisonPlanSummary;
  planB: PlanComparisonPlanSummary;

  courseDiffs: CourseDiffs;
  semesterDiffs: SemesterDiff[];
  requirementDiffs: RequirementDiff[];
  prereqRiskDiffs: PrereqRiskDiff[];
  summary: ComparisonSummary;
}

export interface PlanComparisonPlanSummary {
  id: PlanId;
  name: string;
  description: string;
  semesterCount: number;
  totalCourses: number;
  totalCredits: number;
  maxSemesterCredits: number;
}

export interface CourseDiffs {
  onlyInA: CourseId[];
  onlyInB: CourseId[];
  moved: MovedCourse[];
  unchanged: CourseId[];
}

export interface MovedCourse {
  courseId: CourseId;
  fromSemester: SemesterId;
  toSemester: SemesterId;
}

export interface SemesterDiff {
  semesterId: SemesterId;
  creditsA: number;
  creditsB: number;
  creditDelta: number;
  coursesOnlyInA: CourseId[];
  coursesOnlyInB: CourseId[];
}

export interface RequirementDiff {
  groupId: string;
  groupName: string;
  completedA: number;
  completedB: number;
  total: number;
  delta: number;
}

export interface PrereqRiskDiff {
  courseId: CourseId;
  semesterA?: SemesterId;
  semesterB?: SemesterId;
  riskInA: RiskLevel;
  riskInB: RiskLevel;
  changed: boolean;
  reason?: string;
}

export interface ComparisonSummary {
  movedCourseCount: number;
  coursesOnlyInACount: number;
  coursesOnlyInBCount: number;
  semestersWithChanges: number;
  requirementsImprovedInB: number;
  requirementsRegressedInB: number;
  prereqRisksAddedInB: number;
  prereqRisksRemovedInB: number;
  totalCreditsA: number;
  totalCreditsB: number;
  maxSemesterCreditsA: number;
  maxSemesterCreditsB: number;
}
```

---

## Naming decisions

### `onlyInA` / `onlyInB`
Use these instead of `added` / `removed`.

Why:
- comparison is not inherently directional in the user-facing sense
- avoids confusion about whether “added” means “added to B” or “added to the diff”
- clearer in tests and UI rendering

### `RequirementDiff`
Use `Diff`, not `Delta`, for consistency with the rest of the contract.

### `PlanComparisonPlanSummary`
Use a dedicated summary shape instead of embedding raw `PlanVariant` in the result.

Why:
- avoids leaking non-comparison fields into downstream consumers
- ensures comparison output is stable even if `PlanVariant` evolves
- gives UI a concise, ready-to-render header block

---

## Behavioral rules

### 1. Comparison blocking
If `issues` contains any `type === "error"`, then:

```ts
success = false
comparison = undefined
```

Warnings and info may still allow comparison.

### 2. Moved course rule
A course is `moved` if:
- it exists in both plans
- and its semester differs

A moved course must **not** also appear in `onlyInA` or `onlyInB`.

### 3. Semester coverage rule
`semesterDiffs` must include the union of semesters from both plans.

### 4. Requirement diff rule
Requirement coverage must be computed from existing canonical requirement/progress logic.

No parallel requirement engine is allowed.

### 5. Prereq diff rule
Prereq risk must be computed from existing canonical prereq validation logic.

No new semantics layer is allowed inside comparison.

---

## Mapping from existing Task 5 types

If current Task 5 types already exist in `lib/plan-types.ts`, update them toward this shape:

### Replace
```ts
added / removed
```
with
```ts
onlyInA / onlyInB
```

### Replace
```ts
RequirementDelta
```
with
```ts
RequirementDiff
```
when practical.

### Replace
```ts
PrerqRiskChange { riskType: 'added' | 'removed' | 'modified' }
```
with
```ts
PrereqRiskDiff { riskInA, riskInB, changed }
```

Why:
The latter is more explainable and easier for UI and tests.

---

## Example

```ts
const comparison: PlanComparison = {
  planA: {
    id: "ml-efficient",
    name: "ML-Efficient Path",
    description: "Statistical learning theory and mathematical foundations",
    semesterCount: 5,
    totalCourses: 21,
    totalCredits: 56,
    maxSemesterCredits: 18,
  },
  planB: {
    id: "dl-implementation",
    name: "DL-Implementation Path",
    description: "Applied deep learning and neural network implementation",
    semesterCount: 5,
    totalCourses: 21,
    totalCredits: 59,
    maxSemesterCredits: 18,
  },
  courseDiffs: {
    onlyInA: ["APPM-4440", "STAT-4100", "STAT-4520"],
    onlyInB: ["APPM-4370", "STAT-4350", "STAT-4360"],
    moved: [
      { courseId: "CSCI-3155", fromSemester: "SP27", toSemester: "SU27" },
      { courseId: "STAT-4520", fromSemester: "SU27", toSemester: "FA27" },
    ],
    unchanged: ["MATH-2300", "CSCI-2824", "STAT-2600"],
  },
  semesterDiffs: [
    {
      semesterId: "SP27",
      creditsA: 18,
      creditsB: 18,
      creditDelta: 0,
      coursesOnlyInA: ["CSCI-3155"],
      coursesOnlyInB: ["APPM-4370"],
    },
  ],
  requirementDiffs: [],
  prereqRiskDiffs: [],
  summary: {
    movedCourseCount: 2,
    coursesOnlyInACount: 3,
    coursesOnlyInBCount: 3,
    semestersWithChanges: 4,
    requirementsImprovedInB: 0,
    requirementsRegressedInB: 0,
    prereqRisksAddedInB: 0,
    prereqRisksRemovedInB: 0,
    totalCreditsA: 56,
    totalCreditsB: 59,
    maxSemesterCreditsA: 18,
    maxSemesterCreditsB: 18,
  },
};
```

---

## Implementation guidance

For Task 6, Bob/Gilfoyle should:

1. update `lib/plan-types.ts` only as needed to align with this contract
2. add `lib/plan-comparison.ts`
3. add `__tests__/plan-comparison.test.ts`
4. keep comparison logic pure and deterministic
5. use the real ML vs DL fixture as the acceptance test

---

## Acceptance note

This type contract is intended to stop bikeshedding and keep Task 6 implementation narrow.

If a field cannot be populated honestly from current canonical logic, it should be simplified rather than guessed.
