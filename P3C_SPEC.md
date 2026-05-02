# P3-C Recommendation Layer Scope and Semantics

**Project:** Degree Tracker  
**Canonical repo:** `/Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker`  
**Status:** Draft for Alice review — spec-first only  
**Created:** 2026-05-01 19:35 MDT  
**Linear:** 303-24  
**Implementation status:** Not approved. Do not launch Gilfoyle or implement until Alice returns PASS or conditional WARN.

---

## 1. Purpose

P3-C adds a narrow recommendation layer on top of accepted P3-A/P3-B evidence.

The layer may translate concrete comparison diffs and optimization signals into candidate actions, but it must not invent school policy, hidden degree rules, or academic-advising judgment. Every recommendation must be traceable to structured evidence already produced by accepted planning primitives.

Good P3-C output sounds like:

> `Candidate action: move CSCI 3308 earlier to reduce a delayed-critical signal. Evidence: delayed_critical_course signal delayed_critical_course:CSCI-3308 reports 2 semesters delayed and 3 downstream required dependents.`

Bad P3-C output sounds like:

> `You should take CSCI 3308 next because it is the optimal path to graduate on time.`

That second sentence is vibes wearing a lab coat. We are not doing that.

---

## 2. Hard Guardrails

1. **Strictly downstream:** Recommendations may only use accepted P3-A/P3-B facts/signals and canonical audit/course/requirement data already consumed by those primitives.
2. **No hidden school-policy assumptions:** Do not infer CU policy, residency rules, upper-division rules, repeat policy, transfer policy, financial-aid full-time status, or advisor approval requirements unless those rules exist in parsed/canonical input.
3. **No hardcoded degree rules:** No hardcoded 120 credits, 45 upper-division credits, required course lists, elective pools, grade thresholds, or program-specific constraints unless they are present in canonical audit/program/config data passed into the engine.
4. **No `optimal` language unless constraints are explicit:** A recommendation may say a candidate reduces a named signal under a named constraint set. It may not call a path optimal/best/guaranteed without exhaustive constraints and comparison basis in evidence.
5. **No recommendation without concrete supporting evidence:** Every recommendation must carry source signal IDs and/or comparison fact paths.
6. **No hidden academic advisor:** The system can surface candidate planning actions. It cannot tell Anthony what he must take, promise graduation, or replace advisor review.
7. **No implementation before Alice review:** This spec must pass Alice review before code work starts. Conditional WARN may allow implementation only inside Alice's exact fix scope.

---

## 3. Source Facts and Signals

### 3.1 Accepted P3-A Facts

From `lib/plan-types.ts` / `lib/plan-comparison.ts`:

- `PlanComparisonResult.success`
- `PlanComparisonResult.issues[]`
- `PlanComparison.courseDiffs`
  - `onlyInA[]`
  - `onlyInB[]`
  - `moved[]`
  - `unchanged[]`
- `PlanComparison.semesterDiffs[]`
  - `semesterId`
  - `creditsA`
  - `creditsB`
  - `creditDelta`
  - `coursesOnlyInA[]`
  - `coursesOnlyInB[]`
- `PlanComparison.requirementDiffs[]`
  - `groupId`
  - `groupName`
  - `completedA/B`
  - `coveredA/B`
  - `coverageDelta`
  - `total`
- `PlanComparison.prereqRiskDiffs[]`
  - `courseId`
  - `semesterA/B`
  - `riskInA/B`
  - `changed`
  - `reason`
- `PlanComparison.summary`
  - moved course counts
  - requirement coverage improvement/regression counts
  - prereq risks added/removed counts
  - total/max credits by plan

P3-A facts compare candidate plans. They do not prove one plan is globally better.

### 3.2 Accepted P3-B Signals

From `OptimizationSignal` in `lib/plan-types.ts`:

```ts
type OptimizationSignal = {
  id: string;
  kind:
    | 'semester_load'
    | 'prereq_bottleneck'
    | 'delayed_critical_course'
    | 'graduation_risk';
  severity: 'info' | 'warning' | 'risk';
  scope:
    | { type: 'semester'; term: string }
    | { type: 'course'; courseId: string }
    | { type: 'plan' };
  message: string;
  evidence: Record<string, unknown>;
};
```

Accepted signal kinds:

1. `semester_load`
   - Underload: credits `< 12`
   - Overload: credits `> 18`
   - Extreme overload: credits `>= 21`
   - Evidence: `credits`, `courseCount`, `threshold`

2. `prereq_bottleneck`
   - Missing bottleneck course
   - Late-placement bottleneck course
   - Evidence includes threshold, downstream counts, direct/transitive dependents, placement details where applicable.

3. `delayed_critical_course`
   - Required in-plan course delayed at least 2 semesters beyond earliest possible placement.
   - Evidence includes `earliestPossibleTerm`, `actualTerm`, `semestersDelayed`, `downstreamRequiredDependents`, `requiredOnly: true`.

4. `graduation_risk`
   - `riskType: credit_shortfall`
   - `riskType: requirement_undercovered`
   - `riskType: upper_division_shortfall`
   - Evidence includes canonical threshold/source fields. No signal is emitted when canonical source is absent.

---

## 4. Recommendation Types

P3-C should start with a small closed set. Do not make a generic recommendation engine.

### 4.1 `reduce_semester_load`

**Meaning:** Candidate action that may reduce a named overload/extreme-overload semester signal.

**Allowed source evidence:**

- `semester_load` signal with `overload` or `extreme_overload` semantics.
- Optional P3-A comparison showing a candidate plan has lower credits for the same semester without adding prereq risks or requirement regressions.

**Required evidence fields:**

- `sourceSignalIds`: at least one `semester_load:*:overload` or `semester_load:*:extreme_overload` signal.
- `affectedTerm`.
- `currentCredits`.
- `threshold`.
- If naming a course move: `candidateCourseId`, `fromTerm`, `toTerm`, and comparison evidence showing the move does not add known prereq risks.

**Invalidated when:**

- The overload/extreme-overload signal disappears.
- Course credits change.
- The candidate course is no longer in the source term.
- Moving the candidate creates or worsens a P3-A prereq risk.
- Moving the candidate creates requirement coverage regression or graduation-risk evidence.

### 4.2 `fill_underloaded_term`

**Meaning:** Candidate action that may use an underloaded term as capacity.

**Allowed source evidence:**

- `semester_load` underload signal.
- Optional P3-A comparison showing a moved/added course in that term.
- Canonical prereq validation facts showing the candidate course can be placed there.

**Required evidence fields:**

- `sourceSignalIds`: at least one `semester_load:*:underload` signal.
- `targetTerm`.
- `currentCredits`.
- `threshold`.
- If naming a candidate course: proof it is available for that term and does not create known prereq/requirement regressions.

**Invalidated when:**

- The term is no longer underloaded.
- Candidate placement violates prereqs/coreqs.
- Candidate placement causes another term to become overloaded or worsens a risk signal.
- Candidate course is not degree-applicable when the recommendation depends on degree-applicable credit.

### 4.3 `sequence_prereq_bottleneck`

**Meaning:** Candidate action that may place or move a bottleneck prerequisite earlier than affected downstream required courses.

**Allowed source evidence:**

- `prereq_bottleneck` signal.
- Optional `delayed_critical_course` signal for the same course.
- P3-A prereq risk diffs showing risks added/removed by an alternative plan.

**Required evidence fields:**

- `sourceSignalIds`: at least one `prereq_bottleneck:*` signal.
- `courseId`.
- `downstreamRequiredDependents` or direct/transitive dependent lists.
- Current placement/missing status.
- Candidate term if proposing placement.

**Invalidated when:**

- Bottleneck threshold is no longer met.
- The course is no longer required or no longer supports required downstream courses.
- Candidate term is not before affected dependents.
- OR-prereq branch evidence changes and this course is no longer necessary.
- The course is already completed or already placed early enough.

### 4.4 `accelerate_delayed_critical`

**Meaning:** Candidate action that may move a delayed critical required course closer to its earliest possible term.

**Allowed source evidence:**

- `delayed_critical_course` signal.
- Optional `prereq_bottleneck` signal if severity/rationale depends on bottleneck status.

**Required evidence fields:**

- `sourceSignalIds`: at least one `delayed_critical_course:*` signal.
- `courseId`.
- `earliestPossibleTerm`.
- `actualTerm`.
- `semestersDelayed`.
- `downstreamRequiredDependents`.
- Candidate term if proposed.

**Invalidated when:**

- Earliest possible term changes.
- Actual placement changes enough that delay is below signal threshold.
- Required downstream dependent set changes.
- Missing/unplanned prereqs make the candidate earlier term unsupported.
- The candidate move creates another accepted risk signal.

### 4.5 `cover_requirement_gap`

**Meaning:** Candidate action that may address a canonical requirement undercoverage signal.

**Allowed source evidence:**

- `graduation_risk` with `riskType: requirement_undercovered`.
- Canonical `RequirementGroup` course pool and `calcProgress(..., { includePlanned: true })` semantics.
- Optional P3-A requirement coverage diffs.

**Required evidence fields:**

- `sourceSignalIds`: at least one `graduation_risk:requirement_undercovered:*` signal.
- `requirementId`.
- `requiredCount`.
- `coveredCount`.
- `missingCount`.
- Candidate course IDs only if they come from the canonical requirement pool.

**Invalidated when:**

- Requirement group no longer exists in canonical audit/config data.
- Requirement coverage reaches required count.
- Candidate course is not in the canonical requirement pool.
- Candidate course has non-degree-credit status/grade when degree applicability matters.
- Requirement type semantics change.

### 4.6 `address_credit_shortfall`

**Meaning:** Candidate action that may address a canonical graduation credit shortfall.

**Allowed source evidence:**

- `graduation_risk` with `riskType: credit_shortfall`.
- Canonical `requiredCredits.source` from program/audit/config.
- Degree-applicable credit semantics accepted in P3-B.

**Required evidence fields:**

- `sourceSignalIds`: `graduation_risk:credit_shortfall`.
- `requiredCredits`.
- `plannedDegreeApplicableCredits`.
- `creditsShort`.
- `source`.
- Candidate courses only if their degree applicability is concrete and source is known.

**Invalidated when:**

- Required-credit source disappears or changes.
- Planned degree-applicable credits meet/exceed required credits.
- Candidate course is not degree-applicable.
- Completed course grade/status changes to a non-credit state.

### 4.7 `address_upper_division_shortfall`

**Meaning:** Candidate action that may address a canonical upper-division minimum-hours shortfall.

**Allowed source evidence:**

- `graduation_risk` with `riskType: upper_division_shortfall`.
- Canonical upper-division `minimum_hours` requirement group.

**Required evidence fields:**

- `sourceSignalIds`: `graduation_risk:upper_division_shortfall:*`.
- `requirementId`.
- `requiredHours`.
- `plannedHours`.
- `hoursShort`.
- `source`.
- Candidate courses only if canonical data marks them as satisfying the requirement; do not parse course numbers as a new policy source.

**Invalidated when:**

- Canonical upper-division requirement group is absent.
- Planned hours meet/exceed required hours.
- Candidate course is not canonical evidence for upper-division satisfaction.
- Requirement hours/source changes.

### 4.8 `compare_plan_tradeoff`

**Meaning:** Factual tradeoff note between two named plans, not a directive.

**Allowed source evidence:**

- P3-A `PlanComparison` facts.
- P3-B signal deltas calculated for both plans using accepted signal functions.

**Required evidence fields:**

- `sourceComparisonId` or deterministic comparison key.
- `planAId`, `planBId`.
- Specific changed facts: e.g. credit delta, moved courses, requirement coverage delta, prereq risk added/removed, signal count changes.
- Constraint label if using any summary phrase, e.g. `constraintSet: 'minimize accepted risk signals among compared plans only'`.

**Invalidated when:**

- Either plan changes.
- Comparison validation fails.
- Signal counts/facts change.
- Constraint set is missing but recommendation tries to rank plans.

---

## 5. Recommendation Schema

Proposed TypeScript shape:

```ts
export type RecommendationType =
  | 'reduce_semester_load'
  | 'fill_underloaded_term'
  | 'sequence_prereq_bottleneck'
  | 'accelerate_delayed_critical'
  | 'cover_requirement_gap'
  | 'address_credit_shortfall'
  | 'address_upper_division_shortfall'
  | 'compare_plan_tradeoff';

export type RecommendationPriority = 'low' | 'medium' | 'high' | 'blocking';
export type RecommendationConfidence = 'low' | 'medium' | 'high';

export interface PlanningRecommendation {
  id: string;
  type: RecommendationType;
  priority: RecommendationPriority;
  confidence: RecommendationConfidence;
  scope:
    | { type: 'plan'; planId?: string }
    | { type: 'semester'; planId?: string; term: string }
    | { type: 'course'; planId?: string; courseId: string }
    | { type: 'requirement'; planId?: string; requirementId: string }
    | { type: 'comparison'; planAId: string; planBId: string };
  title: string;
  message: string;
  action?: {
    kind:
      | 'move_course'
      | 'add_course'
      | 'remove_course'
      | 'review_requirement'
      | 'compare_plans'
      | 'no_action_generated';
    courseId?: string;
    fromTerm?: string;
    toTerm?: string;
    requirementId?: string;
  };
  evidence: {
    sourceSignalIds: string[];
    sourceComparisonFacts: string[];
    sourceDataKinds: Array<'audit' | 'program' | 'config' | 'course' | 'plan' | 'comparison' | 'optimization_signal'>;
    facts: Record<string, unknown>;
    constraintSet?: string;
  };
  invalidatedBy: string[];
}
```

Schema rules:

- `sourceSignalIds` may be empty only for pure P3-A `compare_plan_tradeoff` recommendations, but `sourceComparisonFacts` must then be non-empty.
- `message` must be factual and candidate-oriented.
- `action` is optional. If the system cannot prove a safe concrete action, emit a recommendation with `action.kind: 'review_requirement'` or `no_action_generated`, not a fake move/add suggestion.
- `id` must be deterministic from type + source signal/comparison key + target scope.
- `facts` must duplicate the minimum evidence needed to render/explain the recommendation without re-running hidden logic.

---

## 6. Confidence Semantics

Confidence answers: **How directly does accepted evidence support this candidate action?**

- `high`: Single accepted signal/fact directly supports the recommendation, all required source fields are present, and no known accepted signal contradicts it.
- `medium`: Evidence supports the issue, but the candidate action depends on one derived placement/candidate check that must be shown in evidence.
- `low`: The system can identify the planning issue, but cannot identify a safe concrete action. Low-confidence recommendations must use `review_requirement` or `no_action_generated`, not a course move/add directive.

Confidence must never mean probability of graduation, advisor approval, course availability, schedule availability, or policy correctness.

---

## 7. Priority Semantics

Priority answers: **How important is it to inspect this candidate action relative to other surfaced candidates?**

- `blocking`: Backed by a `risk` signal that prevents a plan from satisfying known canonical requirements, e.g. requirement undercoverage or large credit/upper-division shortfall. This still does not mean graduation is impossible; it means accepted evidence currently blocks the plan from satisfying known parsed constraints.
- `high`: Backed by a `risk` signal or multiple warning signals affecting the same course/term/requirement.
- `medium`: Backed by one warning signal with a concrete supported action.
- `low`: Informational tradeoff or warning without a concrete supported action.

Priority must not encode personal preference, workload tolerance, professor quality, course availability, financial aid status, or advisor judgment unless explicit canonical data exists.

---

## 8. Forbidden Language

Do not generate recommendation titles/messages containing these words or claims unless explicitly quoted from source data and not used as system advice:

- `optimal`, `best`, `perfect`, `ideal`
- `guaranteed`, `ensures`, `will graduate`, `on track to graduate` without named constraint/source
- `should`, `must`, `need to`, `have to`, `required to take` unless referring to a parsed requirement group fact
- `advisor-approved`, `CU-approved`, `official`, `compliant` unless backed by an official parsed source and scoped to that source
- `smart`, `recommended by AI`, `better path`, `worse path`
- `safe` / `safer` unless the exact risk metric and comparison set are named
- `faster` unless the exact completion-term delta and compared plans are named

Preferred phrasing:

- `Candidate action:`
- `This may reduce...`
- `Evidence shows...`
- `Compared with [plan A], [plan B] has...`
- `This is based on [signal/fact], not advisor approval.`

---

## 9. Non-Goals

P3-C does not include:

- Full academic advising automation.
- Course availability, section scheduling, seats, professors, registration windows, or term offerings unless canonical data is later added and reviewed.
- Financial aid/full-time status policy logic.
- Hidden CU policy assumptions.
- ML/DL career-path ranking.
- GPA projection or grade-outcome recommendations.
- Export/advisor packet work.
- Drag-and-drop UI implementation.
- Automatic plan mutation.
- Any implementation work before Alice review.

---

## 10. Acceptance Criteria

The P3-C spec is acceptable when:

1. Every recommendation type maps to accepted P3-A facts and/or P3-B signal kinds.
2. Every recommendation requires concrete evidence.
3. Every recommendation defines invalidation conditions.
4. Confidence and priority are evidence semantics, not personal/academic advice semantics.
5. Forbidden language blocks advisor-like or hidden-policy claims.
6. Non-goals keep P3-C from becoming a vibes engine.
7. Test requirements are explicit enough for Gilfoyle to implement without guessing.
8. Turing and Alice gates are explicit.
9. Anthony escalation boundary is explicit.
10. The spec does not authorize implementation until Alice returns PASS or conditional WARN.

---

## 11. Test Requirements for Future Implementation

When implementation is later approved, tests must be written before or alongside code.

Minimum required test groups:

1. **Schema validation tests**
   - Reject recommendation without `sourceSignalIds` and without `sourceComparisonFacts`.
   - Reject recommendation with unsupported `type`.
   - Require deterministic ID shape.

2. **Evidence mapping tests**
   - Each recommendation type can be produced from its allowed accepted signal/fact.
   - Each recommendation type is not produced when required evidence fields are missing.

3. **Invalidation tests**
   - Signal removed -> recommendation removed.
   - Requirement/credit/source fields changed -> affected recommendation removed or recalculated.
   - Candidate move that adds prereq risk -> move recommendation suppressed.

4. **Language policy tests**
   - No forbidden terms in generated `title` or `message`.
   - No `should`/`must`/`optimal`/`best`/advisor-like language.

5. **Priority/confidence tests**
   - `risk` signals map no lower than `high` unless no action is generated.
   - missing candidate action lowers confidence.
   - confidence never depends on unsupported external data.

6. **Golden fixture tests**
   - Use existing ML/DL plan fixture to produce stable comparison tradeoff notes.
   - Fixture recommendations must cite source facts/signals by ID/path.

7. **No hidden policy regression tests**
   - No hardcoded 120 credits.
   - No inferred upper-division rule without canonical `minimum_hours` group.
   - No course-number parsing as policy source.

Verification commands expected after implementation:

```bash
npm test
npm run build
```

Implementation cannot be called done until Turing verifies tests/build and Alice reviews semantics if the output language or recommendation semantics changed.

---

## 12. Turing Gate

Turing must review any P3-C implementation before Alice final review.

Turing should verify:

- Spec conformance by recommendation type.
- Test coverage for schema, evidence mapping, invalidation, language policy, priority/confidence, fixtures, and hidden-policy regressions.
- `npm test` passes.
- `npm run build` passes.
- No secret exposure.
- No implementation expands beyond Alice-approved P3-C scope.

A Turing PASS only clears QA. It does not authorize completion if Alice semantic review is required.

---

## 13. Alice Review Gate

Alice must review this spec before implementation begins.

Alice should return:

- `PASS`: Bob may create implementation packets for Gilfoyle inside this spec.
- `WARN`: Bob may proceed only if Alice gives exact fix scope or explicit conditional implementation scope.
- `FAIL`: Bob must revise the spec and resubmit; no implementation.

Alice review should focus on:

- Whether recommendation semantics are too advisor-like.
- Whether evidence requirements are strong enough.
- Whether confidence/priority semantics are safe.
- Whether forbidden language is sufficient.
- Whether acceptance/test criteria are implementation-ready.
- Whether Anthony needs to decide any product/school-risk tradeoff before implementation.

---

## 14. Anthony Escalation Boundary

Anthony decision is required if:

- P3-C scope expands beyond evidence-backed candidate planning actions.
- The team wants to add or accept any school-policy assumption not present in canonical data.
- The team wants to hardcode degree rules or program requirements.
- The team wants to use `optimal`, `best`, `safe/safer`, or `faster` framing without explicit constraints.
- Alice and Bob disagree on semantic direction.
- Alice returns FAIL or a WARN requiring product/school-risk judgment.
- Any external action is proposed: deploy, upload, publish, school/advisor communication, account changes, or remote push.

Anthony decision is not needed for this spec-first draft and Alice review handoff.

---

## 15. Staff Roles

- **Bob:** operational owner, Linear/docs/status/handoff.
- **Knope:** spec/documentation drafting role for this planning artifact.
- **Turing:** future QA gate for implementation; not launched for implementation now.
- **Alice:** semantic/spec review gate before implementation.
- **Gilfoyle:** explicitly not launched. No implementation until Alice PASS or conditional WARN.
