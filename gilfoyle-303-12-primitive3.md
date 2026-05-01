# Gilfoyle Packet — 303-12: P3-B Primitive 3 Delayed-Critical Course Warnings

## Owning Orchestrator
Bob / OpenClaw

## Specialist Role
Gilfoyle — Software Engineer

## Role Doc
/Users/anthony/Agents/Agent Memory Vault/Agent-Shared/organization/roles/bob/software-engineer.md

## Invocation Level
Level 2

## Model Tier
Tier A — `openai-codex/gpt-5.5`

---

## Goal

Implement Primitive 3: **Delayed-Critical Course Warnings** for the Degree Tracker P3-B optimization layer.

Produce a new `lib/delayed-critical.ts` module and a comprehensive test suite covering all edge cases defined by Alice's clarified semantics (verbatim below). Integrate the new signal kind into the existing `OptimizationSignal` type (already declared in `lib/plan-types.ts` as `'delayed_critical_course'`).

---

## Phase / Task ID

Phase 3-B / Issue 303-12 / Primitive 3

---

## Anthony-Approved Direction

Phase 3 is approved. Alice's WARN verdict required semantics clarification before implementation. Bob has processed the WARN. The clarified semantics below are the final approved implementation spec for Primitive 3. Proceed.

---

## Repo / CWD

```
/Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker
```

---

## Allowed Files

**Write:**
- `lib/delayed-critical.ts` (new file — primary deliverable)
- `__tests__/delayed-critical.test.ts` (new file — tests)
- `lib/plan-types.ts` — only if a minor type refinement is needed for evidence fields; do not restructure the file
- `CONTEXT.md` — update with implementation notes

**Read (do not write):**
- `lib/prereqs.ts` — `isRuleSatisfied`, `getMissingIds`, `collectCourseIds`
- `lib/prereq-bottleneck.ts` — reference for Primitive 2 patterns
- `lib/plan-types.ts` — `OptimizationSignal`, `PlanVariant`
- `lib/types.ts` — `Course`, `PrereqRule`
- `lib/semester-load.ts` — reference for termOrd pattern
- `__tests__/prereq-bottleneck.test.ts` — reference for test patterns

---

## Forbidden Files

- Do not touch `app/`, `components/`, or any UI file — no UI for this primitive
- Do not modify `lib/prereqs.ts`, `lib/prereq-bottleneck.ts`, `lib/semester-load.ts`, or any other existing lib file (except `lib/plan-types.ts` for minor evidence type additions)
- Do not modify existing test files
- Do not push, deploy, or publish
- Do not read `.env.local`
- Do not widen scope or spawn additional agents

---

## Read First

1. `lib/prereqs.ts` — especially `isRuleSatisfied`, `getMissingIds`
2. `lib/prereq-bottleneck.ts` — full file; note the `termOrd` helper, `buildReverseDeps`, `getDownstream`, and signal emission patterns
3. `lib/plan-types.ts` — `OptimizationSignal` type and `PlanVariant` interface
4. `lib/types.ts` — `Course`, `PrereqRule`

---

## Alice-Approved Semantics (verbatim — implement exactly as stated)

These are the mandatory semantics for Primitive 3. Copy them into the JSDoc of `lib/delayed-critical.ts` so Turing can verify compliance.

> **Critical** = required course with >=1 sorted unique required downstream dependent in the plan.
> Use sorted unique required downstream dependents in-plan.
>
> **Delayed** = placed >=2 semesters later than earliest possible placement.
> Earliest possible placement must be computed from canonical prereq satisfaction, not flattened prereq IDs, especially for OR rules.
>
> No-prereq courses use the first plan/horizon term as earliest possible.
>
> Completed prereqs before the plan horizon count as available.
>
> Missing/unplanned prereqs should not produce bogus delayed-critical signals.
>
> Bottleneck severity upgrade applies only if the course is already delayed by >=2 semesters.
>
> Severity: warning if delayed 2 semesters, risk if delayed >=3 or delayed >=2 and also bottleneck.
>
> Evidence: earliestPossibleTerm, actualTerm, semestersDelayed, downstreamRequiredDependents, requiredOnly: true.
>
> Messages stay factual; no recommendation/ranking language.

---

## Implementation Specification

### Public API

```typescript
export function analyzeDelayedCritical(
  plan: PlanVariant,
  courses: Course[],
  requiredCourseIds: string[],
  options?: {
    /**
     * Term IDs of courses completed before the plan horizon.
     * Completed courses count as available for earliest-possible computation.
     * Default: derive from courses where status === "completed".
     */
    completedCourseIds?: string[];
    /**
     * Ordered list of all terms in the plan horizon (e.g. ["FA26", "SP27", "FA27"]).
     * If omitted, derive from sorted keys of plan.semesters.
     */
    planTerms?: string[];
  },
): OptimizationSignal[];
```

### Step-by-Step Algorithm

1. **Build plan metadata**
   - Derive sorted plan terms from `Object.keys(plan.semesters)` sorted by `termOrd` (same helper pattern as `prereq-bottleneck.ts`).
   - Build `courseToTerm: Map<string, string>` from the plan.
   - Build `planCourses: Set<string>` (all courses assigned in the plan).
   - Build `completedSet: Set<string>` — courses with `status === "completed"` from the provided courses array (these count as prereq-available even if not in the plan).

2. **Identify critical candidates**
   - A course is **critical** if:
     - It is in `requiredCourseIds`
     - It is in `planCourses`
     - It has >=1 required downstream dependent in the plan (use the same `buildReverseDeps` + `getDownstream` pattern from Primitive 2, restricted to required courses in the plan)
   - Compute `downstreamRequiredDependents`: sorted unique required course IDs that are downstream (direct + transitive) of this course AND are present in the plan.

3. **Compute earliest possible term**
   - A course's earliest possible term is the first plan term where all of its prerequisites are satisfied.
   - Use `isRuleSatisfied(course.prereqs, available)` from `lib/prereqs.ts` — **do not flatten prereq IDs**. OR rules must be evaluated correctly.
   - `available` accumulates as you walk sorted plan terms:
     - Before the first plan term: seed `available` with `completedSet`.
     - At each term: courses in that term are added to `available` after checking whether the term qualifies (i.e., do not add the course itself to its own availability check).
     - A term qualifies as `earliestPossibleTerm` if, after adding courses from all prior terms (and the completed set), `isRuleSatisfied` returns true (or the course has no prereqs).
   - If no prereqs: `earliestPossibleTerm` = first plan term.
   - If prerequisites are present but cannot be satisfied by any combination of plan terms + completed courses (i.e., they are missing/unplanned), **do not emit a signal** for this course. Log nothing — just skip it.

4. **Compute delay**
   - `semestersDelayed = termOrd(actualTerm) - termOrd(earliestPossibleTerm)`
   - (Use integer-safe `termOrd` from Primitive 2 — year × 3 + prefix ordinal)
   - If `semestersDelayed < 2`, skip — not delayed.

5. **Determine if bottleneck**
   - A course is a **bottleneck** by Primitive 2 semantics: it has >=3 unique downstream required dependents (direct + transitive) in the plan.
   - Only use this for severity upgrade; do not emit this primitive solely because a course is a bottleneck.

6. **Compute severity**
   - `semestersDelayed === 2` → `'warning'`
   - `semestersDelayed >= 3` OR (`semestersDelayed >= 2` AND is bottleneck) → `'risk'`

7. **Build signal**
   ```typescript
   {
     id: `delayed_critical_course:${courseId}`,
     kind: 'delayed_critical_course',
     severity,
     scope: { type: 'course', courseId },
     message: `${courseId} is placed in ${actualTerm}; earliest valid placement after prerequisites is ${earliestPossibleTerm}; delayed by ${semestersDelayed} semester(s); has ${downstreamRequiredDependents.length} downstream required dependent(s).`,
     evidence: {
       earliestPossibleTerm,
       actualTerm,
       semestersDelayed,
       downstreamRequiredDependents,   // sorted unique required course IDs in-plan
       requiredOnly: true,
     },
   }
   ```

---

## Test Requirements

Write `__tests__/delayed-critical.test.ts`. Use the same Vitest pattern as `__tests__/prereq-bottleneck.test.ts`.

**Mandatory test cases (Alice-required):**

1. **No-prereq course** — no prereqs → earliest possible = first term → no signal if placed in first term
2. **No-prereq course placed 1 semester late** — no signal (below threshold)
3. **No-prereq course placed exactly 2 semesters late** → `warning`
4. **Course placed exactly 2 semesters late (with prereq)** → `warning`
5. **Course placed 3+ semesters late** → `risk`
6. **Bottleneck upgrade** — course delayed 2 semesters AND is a bottleneck (>=3 downstream required) → `risk`
7. **Bottleneck but not delayed** — bottleneck but placed at earliest possible → no signal
8. **Non-required downstream excluded** — non-required downstream dependents do not count toward `downstreamRequiredDependents` and do not make a course critical
9. **OR prereq branch** — course has `{ type: "or", rules: [...] }`; satisfying either branch qualifies; the OR branch should not overconstrain earliest placement
10. **Missing prereq** — prereq is absent from plan and not completed → do not emit delayed-critical signal
11. **Completed prereq before plan horizon** — prereq completed (status="completed") but not in plan semesters → counts as available → course not penalized
12. **Course with no required downstream dependents** — not critical → no signal even if placed late
13. **1-semester delay** — no signal

---

## Constraints

- Preserve existing user changes.
- Do not revert unrelated files.
- Do not read, print, copy, or store secrets from `.env.local`.
- Do not push, deploy, upload, publish, purchase, send external messages, or run `sudo`.
- Do not widen scope or spawn more agents without Bob/Anthony approval.
- Stop if required files or repo state do not match the assignment.
- Signal messages must be factual — no "should", "recommend", "must", "better", "worse".

---

## Definition Of Done

- `lib/delayed-critical.ts` exists and exports `analyzeDelayedCritical`
- All 13+ mandatory test cases pass
- `npm test` passes (full suite — no regressions)
- `npm run build` completes without TypeScript errors
- `CONTEXT.md` updated with: files changed, semantics summary, test results
- No UI changes

---

## Verification

Run in order:
1. `npm test` — full suite must pass
2. `npm run build` — TypeScript must compile clean

Report exact output of both commands.

---

## Subagent Run Identity

- Logical run name: `gilfoyle-303-12-primitive3-delayed-critical`
- Runtime session id/key: (report on first progress update)
- Parent orchestrator session: Bob / OpenClaw main
- Model: `openai-codex/gpt-5.5`

---

## Report Back With

- Summary of implementation
- Files changed (with line counts if useful)
- Verification run output (`npm test` and `npm run build`)
- Any risks or follow-ups
- `Turing review required: yes`
