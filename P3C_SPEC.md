# P3-C Recommendation Layer — Spec (DRAFT, pending Alice review)

**Status:** Draft — awaiting Alice PASS before implementation  
**Created:** 2026-05-01  
**Phase:** Phase 3-C of the Degree Tracker planning system  
**Canonical repo:** `/Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker`

---

## Hard Constraint

P3-C is strictly downstream of accepted P3-A/P3-B evidence.

A recommendation is only valid if it can be traced to one or more concrete
`OptimizationSignal` records, `PlanComparison` deltas, or `calcProgress`
results from accepted primitives. No signal = no recommendation.

---

## Core Philosophy

P3-C surfaces actionable interpretation of existing P3-A/P3-B facts.
It does not introduce new academic rules, policy, or planning intelligence
that is not already grounded in:

- audit-derived `RequirementGroup` data
- `OptimizationSignal[]` from P3-B primitives
- `PlanComparison` / `PlanComparisonResult` from P3-A
- `calcProgress()` outputs from `lib/progress.ts`

P3-C is a signal-aggregation and surfacing layer, not an advisor.

---

## Recommendation Types

### 1. `resolve_overload`
**Trigger:** One or more `semester_load` signals with `severity: 'risk'` or
`severity: 'warning'` (credits > 18).  
**What it says:** "Semester FA26 is overloaded (21 credits). You may have room
to move [COURSE-ID] to SP27 without breaking prereqs."  
**Evidence required:** `semester_load` signal + downstream prereq check
confirming the course can move without creating a prereq violation.  
**Does not say:** "You should lighten your load." (no imperative; see
Forbidden Language section)

---

### 2. `resolve_underload`
**Trigger:** One or more `semester_load` signals with `severity: 'warning'`
(credits < 12).  
**What it says:** "Semester SP27 has 9 credits (underloaded). Requirement group
[X] has uncovered courses that could be placed here without a prereq conflict."  
**Evidence required:** `semester_load` signal + `calcProgress` showing
uncovered courses eligible for placement in that term.  
**Does not say:** "Fill up your semester." No imperative framing.

---

### 3. `address_prereq_bottleneck`
**Trigger:** `prereq_bottleneck` signal (`severity: 'warning'` or `'risk'`).  
**What it says:** "Course [X] is a prerequisite for [N] required downstream
courses and is not currently in the plan. [X] could be placed as early as
[TERM] given current prereqs."  
**Evidence required:** `prereq_bottleneck` signal from `lib/prereq-bottleneck.ts`
with `downstreamRequiredCount` and earliest available term computed via existing
prereq logic.  
**Does not say:** "You must add [X] now." No urgency framing not backed by
graduation-risk evidence.

---

### 4. `advance_delayed_critical`
**Trigger:** `delayed_critical_course` signal.  
**What it says:** "Course [X] is placed in [ACTUAL-TERM] but could be placed as
early as [EARLIEST-TERM]. It has [N] required downstream dependents in the plan.
Moving it earlier would unblock [Y, Z]."  
**Evidence required:** `delayed_critical_course` signal with `earliestPossibleTerm`,
`actualTerm`, `semestersDelayed`, `downstreamRequiredDependents`.  
**Does not say:** "Move this course." No imperative. The evidence speaks.

---

### 5. `graduation_risk_action`
**Trigger:** `graduation_risk` signal (`credit_shortfall`,
`requirement_undercovered`, or `upper_division_shortfall`).  
**What it says:** factual restatement of the specific risk with the gap value.
For `requirement_undercovered`: lists the specific uncovered required courses
that exist in the catalog and have no prereq conflict in a future term.  
**Evidence required:** `graduation_risk` signal from `lib/graduation-risk.ts`
with full evidence object (requiredCredits, coveredCount, etc.).  
**Does not say:** "You need to act now" or "You are in danger of not graduating."
Factual gap only.

---

### 6. `plan_comparison_insight`
**Trigger:** `PlanComparisonResult` showing meaningful deltas between two named
plan variants (credit delta, prereq risk change, requirement coverage delta).  
**What it says:** "Plan A covers [N] more required courses in the upper-division
group than Plan B. Plan B has [M] fewer overloaded semesters."  
**Evidence required:** `PlanComparison` output with non-zero deltas in one or
more of: `creditDeltas`, `requirementDeltas`, `prereqRiskChanges`, semester
signal count diffs.  
**Does not say:** "Plan A is better." No ranking without explicit constraint set.

---

## Recommendation Schema

```typescript
export interface Recommendation {
  /** Unique ID — deterministic from source signals */
  id: string;

  /** Type of recommendation */
  type:
    | 'resolve_overload'
    | 'resolve_underload'
    | 'address_prereq_bottleneck'
    | 'advance_delayed_critical'
    | 'graduation_risk_action'
    | 'plan_comparison_insight';

  /** Severity of the underlying evidence */
  severity: 'info' | 'warning' | 'risk';

  /**
   * Priority within severity tier.
   * Derived from evidence magnitude (e.g. credits short, semesters delayed,
   * downstream dependent count). Never synthetic.
   * 1 = highest within tier.
   */
  priority: number;

  /** Factual, non-imperative human-readable text */
  message: string;

  /**
   * IDs of P3-B OptimizationSignal records or P3-A PlanComparison fields
   * that produced this recommendation.
   * Must be non-empty. A recommendation with no sourceSignalIds is invalid.
   */
  sourceSignalIds: string[];

  /** Structured evidence — must match source primitive evidence shape */
  evidence: Record<string, unknown>;

  /**
   * Conditions under which this recommendation is no longer valid.
   * Used by invalidation logic.
   */
  invalidatedBy: InvalidationCondition[];
}

export type InvalidationCondition =
  | { kind: 'signal_resolved'; signalId: string }
  | { kind: 'course_added'; courseId: string }
  | { kind: 'course_moved'; courseId: string; targetTerm: string }
  | { kind: 'plan_changed' };
```

---

## Evidence Requirements (per type)

| Type | Required source signals | Required evidence fields |
|---|---|---|
| `resolve_overload` | `semester_load` (warning/risk) | `semesterId`, `credits`, `threshold`, `movableCourseId`, `targetTerm` (optional) |
| `resolve_underload` | `semester_load` (warning, underload) | `semesterId`, `credits`, `threshold`, `availableCourseIds` (calcProgress uncovered) |
| `address_prereq_bottleneck` | `prereq_bottleneck` | `courseId`, `downstreamRequiredCount`, `earliestAvailableTerm` |
| `advance_delayed_critical` | `delayed_critical_course` | `courseId`, `earliestPossibleTerm`, `actualTerm`, `semestersDelayed`, `downstreamRequiredDependents` |
| `graduation_risk_action` | `graduation_risk` | full evidence from graduation-risk signal |
| `plan_comparison_insight` | `PlanComparison` delta fields | delta type, plan names, delta magnitude |

A `Recommendation` object with an empty or missing `sourceSignalIds` array
is invalid and must not be returned.

---

## Priority Semantics

Priority is derived from the magnitude of the underlying evidence.
It is not assigned by intuition or heuristics.

**Rules:**
- Within a severity tier, `priority: 1` = most urgent.
- `graduation_risk` signals always sort before load/scheduling signals
  within the same severity tier.
- Priority is computed at analysis time, not stored.
- Two recommendations with equivalent evidence magnitude get the same priority.

**Priority is not:**
- A judgment about which course is "more important"
- A CU policy opinion
- A GPA projection

---

## Confidence Semantics

P3-C does not emit confidence scores.

Rationale: confidence scores imply probabilistic modeling that does not exist
in this system. If the underlying signal is present, the recommendation is
surfaced. If it is not, it is not. There is no middle ground to model.

---

## What Invalidates Each Recommendation

| Type | Invalidated when |
|---|---|
| `resolve_overload` | Overloaded semester credits drop to ≤18; or the identified movable course is moved or removed |
| `resolve_underload` | Underloaded semester credits rise to ≥12; or all uncovered candidate courses are placed |
| `address_prereq_bottleneck` | The bottleneck course is added to the plan |
| `advance_delayed_critical` | The delayed course is moved earlier than threshold; or downstream deps are removed |
| `graduation_risk_action` | The underlying graduation_risk signal resolves (gap closes) |
| `plan_comparison_insight` | The compared plans no longer differ on the identified dimension |

Invalidation is checked by re-running source primitives, not stored state.

---

## Forbidden Language

The following must never appear in a `Recommendation.message`:

- `should` / `must` / `need to` / `have to`
- `optimal` / `best` / `better` / `worse` / `recommended`
- `strongly` / `highly` / `urgently`
- `risk of not graduating` (graduation risk signal uses factual gap language only)
- `advisor` / `advise` / `advice`
- Any course quality or difficulty judgment

Allowed: factual gap descriptions, term names, course IDs, credit counts,
downstream dependent counts, delta values from P3-A/P3-B.

---

## Non-Goals

❌ GPA projections  
❌ Course difficulty rankings  
❌ "Best next course" ML scoring  
❌ Advisor-facing academic risk narratives  
❌ Any CU-specific policy not already in the audit/requirements data  
❌ Dynamic catalog lookups (future semesters, new courses)  
❌ Hardcoded degree credit totals without a canonical source  
❌ Confidence scores or probabilistic modeling  
❌ Recommendations without a source signal  

---

## Source P3-A/P3-B Facts Used

| Source | What it provides |
|---|---|
| `lib/semester-load.ts` | `semester_load` signals with credit counts, thresholds |
| `lib/prereq-bottleneck.ts` | `prereq_bottleneck` signals with downstream required counts |
| `lib/delayed-critical.ts` | `delayed_critical_course` signals with delay magnitude and deps |
| `lib/graduation-risk.ts` | `graduation_risk` signals with gap values and canonical sources |
| `lib/plan-comparison.ts` | `PlanComparison` with credit, requirement, prereq, and move deltas |
| `lib/progress.ts` `calcProgress()` | uncovered required courses per group |
| `lib/prereqs.ts` `isRuleSatisfied()` | prereq satisfaction checks for placement feasibility |

---

## Acceptance Criteria

1. `generateRecommendations(plan, courses, options)` returns `Recommendation[]`.
2. Every returned `Recommendation` has `sourceSignalIds.length >= 1`.
3. Every `sourceSignalId` references a real signal id from a P3-B primitive
   or a named `PlanComparison` field.
4. No recommendation is emitted when its source signal is absent.
5. No forbidden language in any `message` field.
6. Invalidation conditions for each type are documented and tested.
7. Priority ordering within severity tier is deterministic given the same inputs.
8. All 6 recommendation types have at least 3 unit tests:
   - one that confirms the recommendation is emitted when signal is present
   - one that confirms it is NOT emitted when signal is absent
   - one that confirms the message contains no forbidden language
9. Build clean; all existing tests (314+) still pass.
10. No hardcoded degree rules not present in passed-in options/data.

---

## Test Requirements

### Unit tests (per recommendation type, minimum)
- signal-present → recommendation emitted with correct fields
- signal-absent → no recommendation emitted
- forbidden-language guard (enumerate banned phrases, assert none present)
- invalidation condition — recommendation not emitted after source signal resolves

### Integration tests
- `generateRecommendations` with a plan that triggers all 6 types → correct count
- `generateRecommendations` with a clean plan → empty array
- priority ordering is stable across runs with identical input

### Regression tests
- All existing P3-A/P3-B tests still pass (no regression on primitives)

---

## Implementation Shape (proposal — subject to Alice review)

```typescript
// lib/recommendations.ts

export function generateRecommendations(
  plan: PlanVariant,
  courses: Course[],
  options: RecommendationOptions,
): Recommendation[]
```

```typescript
export interface RecommendationOptions {
  /** Pre-computed P3-B signals, or omit to compute inline */
  signals?: OptimizationSignal[];
  /** Pre-computed P3-A comparison result, or omit if no comparison */
  planComparison?: PlanComparisonResult;
  /** Passed through to graduation-risk analysis */
  requiredCredits?: RequiredCreditsInput;
  requirements?: RequirementGroup[];
}
```

Single file `lib/recommendations.ts` with tests in
`__tests__/recommendations.test.ts`. No new data sources introduced.

---

## Review Gates

### Turing gate
Required after Gilfoyle implementation before Alice review:
- All acceptance criteria above
- Forbidden-language grep clean
- All tests passing (existing + new)
- Build clean
- No new hardcoded rules

### Alice review gate
Required before any UI wiring or deployment:
- Recommendation semantics review: are they strictly downstream?
- Forbidden-language audit
- Priority logic review
- Non-goals confirmed (no scope creep into advisor territory)
- Invalidation logic review

### Anthony escalation boundary
Escalate to Anthony before implementation if:
- A new canonical data source is required (e.g. a required-credits config that
  does not exist in the repo/audit data)
- A recommendation type is proposed that implies CU policy not in audit data
- A confidence/probability model is proposed
- Any external API, ML model, or new dependency is proposed
- The scope of "recommendation" has grown beyond the 6 types above

---

## Open Questions (for Alice review)

1. Should `plan_comparison_insight` be in P3-C or treated as a P3-A UI
   enhancement? It does not require new primitives.
2. Priority tie-breaking: when two `resolve_overload` signals have equal
   credit magnitude, is alphabetical semesterId acceptable?
3. Should recommendations be persisted or always computed on demand?
   Preference: on-demand; no persistence layer in P3-C.

---

*P3-C spec draft. No implementation until Alice returns PASS or conditional WARN.*
