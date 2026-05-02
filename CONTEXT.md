# Degree Tracker Context

This is the decision log and working memory for the project.

## Key Decisions

- 2026-04-30: Degree Tracker is an active legacy exception. The canonical working repo is `/Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker`.
- 2026-04-30: `/Users/anthony/Projects/degree-tracker` exists but is non-canonical/frozen unless Anthony explicitly approves migration or salvage.
- 2026-04-30: New default project policy says source repos should live under `/Users/anthony/Projects`, but this project remains an explicit exception for now.
- Audit-first principle from `SPEC.md`: CU degree audit PDFs are the source of truth for requirements/course data.

## Important Context

- `REPO_AUTHORITY.md` is authoritative for path selection.
- `PHASE_3_PLAN.md` describes the planning-primitives direction: plan comparison, optimization helpers, recommendations, and export later.
- Current package scripts include `npm run build` and `npm test`.
- `.env.local` exists in the repo. Agents must not read, print, copy, or store secret values.

## Links / References

- Project authority: `REPO_AUTHORITY.md`
- Product spec: `SPEC.md`
- Current phase plan: `PHASE_3_PLAN.md`
- Current review: `REVIEW.md`
- Shared project policy: `/Users/anthony/Agents/Agent Memory Vault/Agent-Shared/organization/project-location-policy.md`
- Shared workflow standard: `/Users/anthony/Agents/Agent Memory Vault/Agent-Shared/organization/project-workflow-standard.md`

## Work Log

### 2026-05-01 (P3-B complete)

- P3-B UI (303-23): Alice PASS.
  - Linear 303-23 moved to Done.
  - UI layer surfaces accepted P3-B optimization signals in planner.
  - Turing evidence before Alice review: commit `d93d4ed`, 314/314 tests passing, build clean, all 4 signal kinds wired, signal language policy guard clean.
  - P3-B is complete.
- Next boundary: do not start P3-C or any next phase until the next phase scope is explicit.

### 2026-05-01 — P3-B complete

- 303-23 P3-B UI (Surface optimization signals in planner): Alice PASS received 19:29 MDT.
  - All 4 signal kinds wired in planner. 314/314 tests passing, build clean. Signal language policy verified.
  - 303-23 moved to Done. P3-B is fully complete (all primitives + UI accepted).
  - Repo clean on main branch. No next phase started.
  - Anthony must provide explicit scope before P3-C (Recommendation Layer) or any next phase begins.

### 2026-05-01 — P3-C spec started

- P3-C Recommendation Layer spec drafted (spec-first, no implementation). Linear: 303-24, target state: Alice Review.
- Spec: `P3C_SPEC.md` — recommendation scope/semantics strictly downstream of accepted P3-A/P3-B facts and signals.
  - Covers recommendation types, schema, per-type evidence requirements, P3-A/P3-B source facts, confidence/priority semantics, invalidation, forbidden language, non-goals, acceptance criteria, test requirements, Turing gate, Alice gate, and Anthony escalation boundary.
  - Every recommendation requires concrete source signal IDs and/or named P3-A comparison facts. No evidence = no recommendation.
  - No hidden school-policy assumptions, no hardcoded degree rules, no advisor language, and no "optimal" framing without explicit constraints.
- PHASE_3_PLAN.md updated with P3-C spec-first status.
- Alice handoff sent to `#agent-chat` with active trigger `Alice, [Degree Tracker]` (message id `1499948838503583855`).
- Holding on Gilfoyle delegation until Alice PASS or conditional WARN.

### 2026-04-30

- Added `PROJECT.md`, `CONTEXT.md`, and `WORKFLOW.md` to make repo authority explicit and align with the project workflow standard.
- Marked Degree Tracker as an active legacy exception because source code currently lives inside the OpenClaw project workspace.
- Implemented P3-B Primitive 3 delayed-critical course warnings in `lib/delayed-critical.ts` with tests in `__tests__/delayed-critical.test.ts`.
  - Semantics: required in-plan course with sorted unique required downstream dependents; earliest placement computed with canonical prereq satisfaction (`isRuleSatisfied`) including OR rules; completed prereqs before horizon count as available; missing/unplanned prereqs skip signal; warning at 2-semester delay; risk at 3+ semesters or delayed bottleneck (>=3 downstream required dependents).
  - Verification: `npm test` passed (15 files, 296 tests); `npm run build` passed (Next.js production build and type checks clean).

### 2026-05-01 (continued)

- P3-B Primitive 4 graduation-risk flags (303-13): Alice PASS at 9:09 AM.
  - All semantics confirmed: degree-applicable credit logic, no hardcoded 120, canonical upper-div source required, undercoverage via calcProgress, 3 riskType subtypes.
  - 310/310 tests passing, build clean.
  - 303-13 moved to Done in Linear.
- Committed all P3 work in 4 clean commits (docs, P3-A foundation, P3-B primitives, planner-validation test).
- Created Linear 303-23: P3-B UI — Surface optimization signals in planner. Status: In Progress.
- Next: Delegate P3-B UI implementation to Gilfoyle (303-23).

### 2026-05-01

- P3-B Primitive 3 Correction 1 (303-12): Two bugs in `lib/delayed-critical.ts` fixed per Alice review.
  - Fix 1 (`deriveCompletedSet`): Excluded courses with grade in `NON_DEGREE_CREDIT_GRADES` (W/NR/IP) and `countedTowardDegree===false` from the completed prereq set. Previously these would incorrectly count as prereq-available and produce false delayed-critical signals.
  - Fix 2 (OR reverse-dep mapping): Added `getNecessaryPrereqIds` helper that, for OR rules, returns only the branch actually satisfied by `fullAvailable` rather than flattening all branches via `collectCourseIds`. Updated `buildReverseDeps` to use this helper with `fullAvailable` passed from `analyzeDelayedCritical`. This prevents unused OR alternatives from being registered as critical prereqs.
  - Added 3 regression tests in `__tests__/delayed-critical.test.ts` under `describe('Alice correction regressions')`:
    - Test A: W-grade completed prereq does not count as available → no false delayed-critical for dependent course
    - Test B: NR-grade completed prereq does not count as available (same pattern)
    - Test C: OR branch not used by the satisfied path does not emit delayed-critical signal
  - Verification: `npm test` passed (16 files, 310 tests); `npm run build` passed clean.
