# Gilfoyle Correction Packet — 303-12 Primitive 3 Correction 1

## Owning Orchestrator
Bob / OpenClaw

## Specialist Role
Gilfoyle — Software Engineer

## Invocation Level
Level 2

## Model Tier
Tier A — `openai-codex/gpt-5.5`

---

## Context

This is a focused correction pass. Alice returned a blocking WARN on the Primitive 3 implementation after Turing PASS. Two specific issues must be fixed. Do not refactor beyond what is listed below.

---

## Goal

Fix two bugs in `lib/delayed-critical.ts` identified by Alice's review. Add required regression tests. Everything else must be preserved.

---

## Phase / Task ID

Phase 3-B / Issue 303-12 / Primitive 3 / Correction 1

---

## Repo / CWD

```
/Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker
```

---

## Allowed Files

**Write:**
- `lib/delayed-critical.ts` — two targeted fixes (see below)
- `__tests__/delayed-critical.test.ts` — add required new tests

**Do not touch:**
- `lib/plan-types.ts` — not needed
- Any other file under `lib/`, `app/`, `components/`, `__tests__/` (other files)
- Do not rename, restructure, or otherwise refactor existing code beyond the two fixes

---

## Forbidden Files

Everything not listed above. No UI, no other lib files, no other test files.

---

## Read First

1. `lib/delayed-critical.ts` — full current implementation (understand before touching)
2. `lib/prereqs.ts` — `isRuleSatisfied`, `collectCourseIds`, `NON_DEGREE_CREDIT_GRADES`

---

## Alice's Blocking Findings

### Finding 1: `deriveCompletedSet` is too broad

**Current code:**
```typescript
function deriveCompletedSet(
  courses: Course[],
  completedCourseIds?: string[],
): Set<string> {
  if (completedCourseIds) return new Set(completedCourseIds);
  return new Set(courses.filter((course) => course.status === 'completed').map((course) => course.id));
}
```

**Problem:** Treats ALL `status === 'completed'` courses as prereq-available, including courses with non-degree-credit grades (W, NR, IP). A withdrawn course (W) or non-reported (NR) cannot satisfy a prerequisite.

**Required fix:** When deriving the completed set from course status, exclude courses whose `grade` is in `NON_DEGREE_CREDIT_GRADES` (imported from `lib/prereqs.ts`).

**Canonical authority:** `lib/prereqs.ts` exports `NON_DEGREE_CREDIT_GRADES = new Set(["W", "NR", "IP"])`. Use it. Match the same exclusion pattern used in `validateDrop`:
```typescript
// include completed course only if: no grade, OR grade is not in NON_DEGREE_CREDIT_GRADES
if (!c.grade || !NON_DEGREE_CREDIT_GRADES.has(c.grade)) { include }
```

**Also handle:** `countedTowardDegree === false` — exclude if explicitly excluded. Check if `Course` type has this field; if it does, exclude it.

**Corrected function:**
```typescript
function deriveCompletedSet(
  courses: Course[],
  completedCourseIds?: string[],
): Set<string> {
  if (completedCourseIds) return new Set(completedCourseIds);
  return new Set(
    courses
      .filter((c) => {
        if (c.status !== 'completed') return false;
        if (c.grade && NON_DEGREE_CREDIT_GRADES.has(c.grade)) return false;
        if ((c as Record<string, unknown>).countedTowardDegree === false) return false;
        return true;
      })
      .map((c) => c.id),
  );
}
```

(Adapt the `countedTowardDegree` check to match the actual `Course` type field if it exists — check `lib/types.ts`.)

---

### Finding 2: OR reverse-dep mapping is too conservative

**Current code in `buildReverseDeps`:**
```typescript
for (const prereqId of collectCourseIds(course.prereqs)) {
  const deps = reverse.get(prereqId) ?? new Set<string>();
  deps.add(course.id);
  reverse.set(prereqId, deps);
}
```

**Problem:** `collectCourseIds` flattens ALL branches of OR rules. If course A requires `P1 OR P2` and P1 is in the plan satisfying the prereq chain, P2 still gets registered as having A as a downstream dependent. This incorrectly marks P2 as "critical" for A when P2 is not actually required.

**Required fix:** Replace `collectCourseIds` in `buildReverseDeps` with an OR-aware helper `getNecessaryPrereqIds(rule, available)` that, for OR nodes, picks only the first satisfied branch. If no branch is satisfied, fall back to all branches (conservative fallback, but those courses won't be considered delayed-critical anyway since their prereqs aren't met).

**The `available` set for this purpose:** Build the full plan + completed availability set — every course in any plan term plus every course in `completedSet`. This represents "what will ever be available across the full plan."

**Required new helper (add before `buildReverseDeps`):**
```typescript
/**
 * Return the minimal set of course IDs that are necessary to satisfy a prereq rule,
 * given a set of courses known to be available in the plan.
 *
 * For OR rules: if any branch is satisfied by `available`, return only that branch's IDs.
 * For AND rules: return the union of necessary IDs across all sub-rules.
 * For course leaves: always return [courseId].
 *
 * This prevents unused OR alternatives from being registered as critical prereqs.
 */
function getNecessaryPrereqIds(rule: PrereqRule, available: Set<string>): string[] {
  if (rule.type === 'course') return [rule.courseId];
  if (rule.type === 'and') {
    return rule.rules.flatMap((r) => getNecessaryPrereqIds(r, available));
  }
  if (rule.type === 'or') {
    const satisfied = rule.rules.find((r) => isRuleSatisfied(r, available));
    if (satisfied) return getNecessaryPrereqIds(satisfied, available);
    // No branch satisfied — conservative fallback (course won't be critical)
    return rule.rules.flatMap((r) => getNecessaryPrereqIds(r, available));
  }
  return [];
}
```

**Updated `buildReverseDeps` signature and call site:**
```typescript
function buildReverseDeps(
  courses: Course[],
  requiredInPlanSet: Set<string>,
  fullAvailable: Set<string>, // plan-wide availability for OR branch resolution
): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();

  for (const course of courses) {
    if (!course.prereqs) continue;
    if (!requiredInPlanSet.has(course.id)) continue;

    for (const prereqId of getNecessaryPrereqIds(course.prereqs, fullAvailable)) {
      const deps = reverse.get(prereqId) ?? new Set<string>();
      deps.add(course.id);
      reverse.set(prereqId, deps);
    }
  }

  return reverse;
}
```

**Build `fullAvailable` in `analyzeDelayedCritical` before calling `buildReverseDeps`:**
```typescript
// All courses that will ever be available: plan courses + completed set
const fullAvailable = new Set([...planCourses, ...completedSet]);

const reverseDeps = buildReverseDeps(courses, requiredInPlanSet, fullAvailable);
```

**Important:** `PrereqRule` must be imported. It is already used via `isRuleSatisfied` — check if the import exists. If not, add it from `lib/types.ts`.

---

## Required New Tests

Add these tests to `__tests__/delayed-critical.test.ts`. Place them in a clearly labeled section. Do not modify or remove any existing tests.

### Test A: W-grade completed course does not count as available prereq

Setup:
- Course A has prereq P1
- P1 has `status: 'completed'`, `grade: 'W'`
- A is in the plan several semesters after P1 would have been available
- A is required, has a downstream required dependent

Expected: No delayed-critical signal for A (because P1's W grade means it doesn't satisfy the prereq → P1's earliest term cannot be determined → no signal per missing-prereq rule)

### Test B: NR-grade completed course does not count (same pattern as Test A with grade: 'NR')

### Test C: OR branch not used by the satisfied path does not become critical

Setup:
- Course A requires `{ type: "or", rules: [P1, P2] }`
- P1 is in the plan in term SP27 and satisfies the OR
- P2 is also in the plan but placed in FA28 (several terms after it could have been in SP26)
- P2 is required, P2 has no prereqs of its own
- A has a downstream required dependent
- No course should have A as a dep via P2

Expected: P2 does NOT emit a delayed-critical signal (it has no required downstream dependents because A's dep is now only registered via P1, not P2)

### Test D: Full suite regression (not a new test — just run `npm test` and report 296+ tests pass)

---

## Constraints

- Do not modify or remove existing tests.
- Do not restructure the file beyond the two targeted fixes.
- Do not read, print, copy, or store secrets.
- Do not push, deploy, upload, or run `sudo`.
- Do not widen scope.
- Stop if repo state does not match the assignment.
- Signal messages must remain factual — no recommendation language.

---

## Definition Of Done

- `deriveCompletedSet` excludes W/NR/IP grades (and `countedTowardDegree === false` if field exists)
- `buildReverseDeps` uses `getNecessaryPrereqIds` with OR-aware branch selection
- New tests A, B, C added and passing
- `npm test` passes — all existing tests still pass, total >= 299 (296 + 3 new)
- `npm run build` clean
- `CONTEXT.md` updated with: bug fixes, new tests, verification output

---

## Verification

Run in order:
1. `npm test` — full suite, must pass, report exact count
2. `npm run build` — must compile clean

Report exact output of both.

---

## Subagent Run Identity

- Logical run name: `gilfoyle-303-12-primitive3-correction1`
- Runtime session id/key: (report on first progress update)
- Parent orchestrator session: Bob / OpenClaw main
- Model: `openai-codex/gpt-5.5`

---

## Report Back With

- Summary of changes (specific lines/functions changed)
- New tests added
- Verification output (`npm test` count + `npm run build`)
- Risks or follow-ups
- `Turing review required: yes`
