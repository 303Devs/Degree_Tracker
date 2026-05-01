# Task 6 Handoff Memo

Use this as the operational handoff to Bob/Gilfoyle.

---

## Task 6 directive

Implement the **pure plan comparison engine** in the canonical repo:

`/Users/anthony/agents/.openclaw/workspace/projects/degree-tracker`

Build against the now-clean Task 5 foundation and validated ML/DL demo plans.

### Required outputs
- `lib/plan-comparison.ts`
- `__tests__/plan-comparison.test.ts`

### Required design references
- `docs/plan-state-design.md`
- `docs/plan-comparison-design.md`
- `docs/task-6-execution-checklist.md`

---

## Hard boundaries

### Do
- validate inputs before comparison
- block on error-level issues
- compare valid plans across:
  - courses
  - semesters
  - requirement coverage
  - prereq risk
- use real ML vs DL fixture as acceptance test

### Do not
- add recommendations
- rank plans
- build UI first
- invent new progress/prereq semantics
- introduce a second source of truth

---

## Success definition

Task 6 is done when:
- comparison engine is pure and deterministic
- invalid plans are rejected
- ML vs DL comparison runs cleanly
- full test suite passes
- output is explainable enough for future UI use

---

## Reminder

The win condition is not “lots of code.”
The win condition is a boring, correct comparison engine that gives us trustworthy planning diffs.
