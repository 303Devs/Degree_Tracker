# Task 6 Execution Checklist

**Version:** 1.0  
**Date:** April 30, 2026  
**Scope:** Phase 3 Task 6 - Comparison Engine Execution

---

## Goal

Implement the plan comparison engine on top of the now-stabilized Task 5 foundation.

This checklist is meant to eliminate improvisation.

---

## Preconditions

Before writing comparison logic, confirm all of the following in the canonical repo:

- canonical repo path is `/Users/anthony/agents/.openclaw/workspace/projects/degree-tracker`
- Task 5 types and normalization are in place
- `ml-dl-plans.json` validates with zero `UNKNOWN_COURSE` issues
- `npm test` passes before starting

If any of that is false, stop and fix the foundation first.

---

## Files to create

### Required new files
- `lib/plan-comparison.ts`
- `__tests__/plan-comparison.test.ts`

### Likely updated files
- `lib/plan-types.ts`
- `docs/plan-state-design.md`
- `docs/plan-comparison-design.md`

Do not spread comparison logic across random UI files.

---

## Execution order

### Step 1 — Align types first
Review `docs/plan-comparison-design.md` and reconcile `lib/plan-types.ts` to the comparison contract.

#### Required outcomes
- `CourseDiffs` uses `onlyInA` / `onlyInB`
- moved-course shape is explicit
- `RequirementDiff` shape is clear
- `PrereqRiskDiff` shape is clear
- `PlanComparisonResult` exists or equivalent wrapper exists

#### Stop condition
Do not start implementation until the comparison output contract is stable.

---

### Step 2 — Build validation gate
In `lib/plan-comparison.ts`, implement the top-level wrapper first.

#### Required behavior
- validate plans before comparison
- if any `type === 'error'`, return:
  - `success: false`
  - `comparison: undefined`
  - `issues`
- otherwise continue

#### Required inputs
The top-level comparison function should accept:
- `planA`
- `planB`
- `courses`
- `requirements`

Use canonical repo types only.

---

### Step 3 — Compute derived plan data
Use `computeDerivedPlanData()` for both plans.

#### Rule
Do not manually re-derive credits or course lists in three different helper paths.

If a helper needs:
- total credits
- course set
- semester load

it should consume the derived plan data, not rebuild it sloppily.

---

### Step 4 — Implement course diffs
This is the first real comparison payload.

#### Required outputs
- `onlyInA`
- `onlyInB`
- `moved`
- `unchanged`

#### Rules
- course present in both + different semester = moved
- moved courses do not also appear in `onlyInA` / `onlyInB`
- output should be deterministic and stable
- sort arrays consistently before returning

#### Suggested helper
- `compareCourseAssignments(...)`

---

### Step 5 — Implement semester diffs
Diff over the union of semesters from both plans.

#### Required outputs per semester
- `semesterId`
- `creditsA`
- `creditsB`
- `creditDelta`
- `coursesOnlyInA`
- `coursesOnlyInB`

#### Rules
- include semesters that appear only in one plan
- stable ordering matters
- use canonical semester ordering if available; otherwise deterministic lexical fallback

#### Suggested helper
- `compareSemesterLoads(...)`

---

### Step 6 — Implement summary
Build summary counts from course/semester diff outputs.

#### Required summary values
- moved course count
- course-only counts
- semesters with changes
- total credits A/B
- max semester credits A/B

Do not calculate the same thing separately in UI later if the engine can provide it once.

#### Suggested helper
- `buildComparisonSummary(...)`

---

### Step 7 — Implement prereq risk diffs
Only after course + semester diff is stable.

#### Rule
Use existing canonical prereq logic.
Do not invent a comparison-only prereq semantics model.

#### Required outcome
For relevant courses, produce:
- `riskInA`
- `riskInB`
- `changed`
- optional reason

#### Suggested helper
- `comparePrereqRisks(...)`

If canonical prereq tooling is too coarse for a full risk taxonomy, use the simplest honest version first.

---

### Step 8 — Implement requirement diffs
Do this last among comparison dimensions.

#### Rule
Use existing requirement/progress logic.
Do not create a parallel fake progress engine.

#### Required outcome
For relevant requirement groups, emit:
- completed/satisfied amount in A
- completed/satisfied amount in B
- total target
- delta

#### Suggested helper
- `compareRequirementCoverage(...)`

If exact values are not honestly available from current logic, simplify the type rather than fabricating precision.

---

### Step 9 — Add real fixture tests
Use the actual plans:
- `ml-efficient`
- `dl-implementation`

This is the acceptance test, not just mock-plan theater.

---

## Minimum test matrix

### Core correctness
- identical plans
- moved course
- course only in A
- course only in B
- semester added in one plan
- semester load delta

### Validation gate
- duplicate course plan blocks comparison
- unknown course plan blocks comparison
- empty plan blocks comparison

### Prereq behavior
- prereq regression in B
- prereq improvement in B

### Requirement behavior
- requirement coverage difference is surfaced

### Real fixture
- ML vs DL comparison returns success
- ML vs DL comparison returns non-empty course/semester diff
- ML vs DL comparison returns stable summary values

---

## Output quality rules

### Determinism
Every returned array should have predictable ordering.

Suggested defaults:
- course IDs sorted lexically unless semester placement implies stronger ordering
- semester diffs in canonical semester order
- moved courses sorted by `fromSemester`, then `toSemester`, then `courseId`

### Explainability
Every diff should be comprehensible without reading implementation code.

If a field would require a paragraph to explain, the type is probably wrong.

### Honesty
If the engine cannot determine something from current logic, do not guess.
Either:
- omit it
- simplify it
- or return an issue

---

## What not to do

- do not build UI first
- do not add recommendation logic
- do not rank plans
- do not introduce hidden shadow state
- do not write comparison logic inside page components
- do not bypass canonical validation just because demo data now passes
- do not over-abstract the first version

---

## Suggested implementation shape

A sane first version of `lib/plan-comparison.ts` probably looks like:

```ts
export function comparePlans(...) { ... }
function compareCourseAssignments(...) { ... }
function compareSemesterLoads(...) { ... }
function comparePrereqRisks(...) { ... }
function compareRequirementCoverage(...) { ... }
function buildComparisonSummary(...) { ... }
```

Plain, obvious, testable.

That is what we want.

---

## Review gate before calling Task 6 done

- [ ] Comparison blocks on error-level issues
- [ ] Types match `docs/plan-comparison-design.md`
- [ ] Course moves are distinct from add/remove
- [ ] Semester diff covers union(A, B)
- [ ] Credits are derived, never trusted from imported plan metadata
- [ ] Prereq diff uses canonical prereq logic
- [ ] Requirement diff uses canonical progress logic
- [ ] Real ML vs DL fixture test passes
- [ ] Full test suite passes
- [ ] No recommendation logic leaked in

---

## Expected completion artifact

When Task 6 is done, there should be a short summary note stating:
- what file(s) were added
- what comparison dimensions are implemented
- what known limitations remain
- whether ML vs DL fixture comparison passes cleanly

That summary should be specific, not vibes-based.
