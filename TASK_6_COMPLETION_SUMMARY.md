# TASK 6 COMPLETION SUMMARY: Plan Comparison Engine

**Status:** ✅ **COMPLETED SUCCESSFULLY** (validation blockers fixed)

**Canonical repo:** `/Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker`

**All Tests Passing:** 240/240 tests across 12 test suites  
**Build:** ✅ `next build` passes cleanly

---

## Validation Blocker Fixes (Sue's Review)

Sue's assessment: "Green suite, but false confidence. The validation boundary still leaks."

### Blocker 1: `comparePlans()` returned `success: true` for unknown courses ✅ FIXED
- **Was:** `computeDerivedPlanData` emitted `COURSE_NOT_FOUND` as `warning` — unknown courses got 0 credits but comparison proceeded
- **Fix:** Changed to `error`-level in `lib/plan-normalization.ts`. Unknown courses now block comparison (`success: false`)

### Blocker 2: Duplicate course assignments not blocked ✅ FIXED
- **Was:** Same course in multiple semesters silently overwrote in `buildCourseToSemesterMap`, double-counting credits
- **Fix:** Added `detectDuplicateCourses()` in `lib/plan-comparison.ts`. Runs before comparison, emits `DUPLICATE_COURSE_ASSIGNMENT` error that blocks comparison

### Blocker 3: Validation gate incomplete ✅ FIXED
- **Was:** Missing checks for unknown courses, duplicates, invalid IDs at comparison entry
- **Fix:** Blockers 1 and 2 together complete the gate. `comparePlans` now validates: empty plans (error), unknown courses (error), duplicate assignments (error), pair validation. All errors block comparison.

### Blocker 4: ML/DL tests used relaxed validation ✅ FIXED
- **Was:** Tests passed `validateExists: false` with stale comments about CSCI-2400/CSCI-3155 not being in catalog
- **Fix:** All ML/DL test calls now use strict validation (default). Those courses exist in the catalog. Stale comments removed.

### Additional fix
- `plan-state.test.ts`: Updated test name and assertion from "generates warnings" to "generates errors" for `COURSE_NOT_FOUND`

---

## Files Added

1. **`lib/plan-comparison.ts`** — Pure comparison engine
2. **`__tests__/plan-comparison.test.ts`** — 28 tests covering full matrix

## Files Modified

1. **`lib/plan-types.ts`** — Updated types to match `docs/plan-comparison-design.md` contract
2. **`lib/plan-normalization.ts`** — `COURSE_NOT_FOUND` changed from warning to error
3. **`__tests__/plan-state.test.ts`** — Updated test for error-level unknown courses
4. **`__tests__/plan-comparison.test.ts`** — Added 2 validation gate tests, removed `validateExists: false` from ML/DL tests

---

## Comparison Dimensions Implemented

### 1. Course Diffs (`compareCourseAssignments`)
- `onlyInA` / `onlyInB` — courses unique to each plan
- `moved` — courses in both but different semesters (NOT duplicated in onlyIn*)
- `unchanged` — courses in both, same semester
- All arrays sorted lexically for determinism

### 2. Semester Diffs (`compareSemesterLoads`)
- Covers union of all semesters from both plans
- Per-semester: `creditsA`, `creditsB`, `creditDelta`, `coursesOnlyInA`, `coursesOnlyInB`
- Canonical semester ordering (SP < SU < FA per year)

### 3. Requirement Coverage Diffs (`compareRequirementCoverage`)
- Uses canonical `calcProgress` from `prereqs.ts` — no parallel engine
- Per-group: `completedA`, `completedB`, `total`, `delta`

### 4. Prereq Risk Diffs (`comparePrereqRisks`)
- Uses canonical `isRuleSatisfied` from `prereqs.ts`
- Three risk levels: `ok`, `warning`, `blocked`

### 5. Validation Gate (strict)
- Blocks comparison (`success: false`) on error-level issues:
  - Empty plans
  - Unknown courses (`COURSE_NOT_FOUND`)
  - Duplicate course assignments across semesters (`DUPLICATE_COURSE_ASSIGNMENT`)
  - Invalid semester/course IDs
- Warnings/info don't block comparison

### 6. Comparison Summary
- Aggregate counts across all dimensions

---

## Test Coverage (28 tests in plan-comparison.test.ts)

### Core Correctness (8 tests)
- Identical plans, onlyInA, onlyInB, moved courses, semester loads

### Validation Gate (5 tests)
- Empty plan A/B blocks
- Unknown courses block comparison
- Duplicate courses block comparison
- Valid plans with warnings succeed

### Prereq Behavior (3 tests)
- Regression, improvement, identical

### Requirement Behavior (2 tests)
- Coverage differences, all groups represented

### Full Integration (2 tests)
- Complete comparison, moved courses

### Real ML vs DL Fixture (6 tests, strict validation)
- Normalization, comparison success, course/semester diffs
- Determinism, specific known differences, CSCI-3155 move

### Determinism (1 test)
- Sorted arrays, stable output

---

## Known Limitations

1. **Requirement coverage diffs** reflect `calcProgress` behavior: only `completed` status courses count toward progress. Planned courses don't change completed count — this is by design.

2. **Prereq risk** uses plan-only context. Does not account for coreqs — prereqs only.

---

## Design Contract Compliance

All types match `docs/plan-comparison-design.md`:
- ✅ Validation blocks on errors, allows warnings
- ✅ Unknown courses are errors, not warnings
- ✅ Duplicate assignments are errors
- ✅ ML/DL tests use strict validation
- ✅ Credits derived, never trusted from stored metadata
- ✅ Moved courses distinct from add/remove

---

## Ready for Task 7 / Task 8

The comparison engine is pure, deterministic, and tested against real fixture data with strict validation. No false confidence — the validation boundary is sealed.
