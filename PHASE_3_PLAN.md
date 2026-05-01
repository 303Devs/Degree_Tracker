# Phase 3 Plan - Planning Primitives First

**Status:** Approved scope from Sue's stabilization plan  
**Start Date:** 2026-04-29  
**Approach:** Build planning intelligence before recommendation magic

---

## Core Philosophy

**Start with planning primitives:**
- Compare plans
- Evaluate load/risk  
- Explain tradeoffs
- Support what-if changes

**NOT starting with:**
- "Smart" recommendations
- ML/DL suggestion engines  
- Export features
- Complex UI

---

## Phase 3 Priority Order

### P3-A: Plan Comparison + What-If Foundations (FIRST)
**Why first:** Creates actual planning intelligence without pretending to be magical

**Build:**
- Support for named plan variants
- Compare two plans side-by-side:
  - Semester credit deltas
  - Requirement coverage deltas  
  - Prereq risk deltas
  - Graduation readiness deltas

**Success criteria:** Answer "Given two candidate plans, where do they differ?"

### P3-B: Optimization Helpers (SECOND) 
**Why second:** Explainable, testable, genuinely useful

**Build:**
- Overload/underload semester warnings
- Prereq bottleneck detection  
- Delayed-critical-course warnings
- Graduation-risk flags
- Maybe "safer vs faster" framing

### P3-C: Recommendation Layer (THIRD)
**Only after P3-A and P3-B are stable**

**Build:**
- "Best next course" suggestions
- ML-vs-DL leaning recommendations  
- Balance suggestions
- Path nudges

**Rule:** Every recommendation must be explainable by concrete system outputs

### P3-D: Export (LAST)
**Why later:** Export is downstream of correctness

**Possible outputs:**
- Registration-ready semester list
- Advisor-review snapshot
- Printable/markdown summary

---

## First Implementation Slice: Plan Comparison

**Scope:** Build P3-A only. Answer this question:
> "Given two candidate plans, where do they differ in course placement, credit load, prereq risk, and requirement progress?"

### Data Model Decisions

**Plan representation:** Use existing semester assignment structure, no new abstraction
**Comparison result:** Pure diff object with structured deltas
**Source of truth:** Semester assignments map (no split-brain)

### Available Test Data

We have `ml-dl-plans.json` with two complete plans:
- **ml-efficient:** Mathematical/theoretical focus  
- **dl-implementation:** Applied/tools focus

Perfect for comparison feature development and testing.

---

## Implementation Tasks

### Task 5: Plan-State Design (NEXT)
**Output:** TypeScript interfaces for:
```typescript
interface PlanVariant {
  name: string;
  description: string;
  semesters: Record<string, string[]>; // semester -> course IDs
}

interface PlanComparison {
  creditDeltas: Record<string, number>;
  courseDiffs: {
    added: string[];
    removed: string[];
    moved: Array<{course: string, from: string, to: string}>;
  };
  requirementDeltas: Array<{group: string, delta: number}>;
  prereqRiskChanges: Array<{course: string, risk: 'added' | 'removed'}>;
}
```

### Task 6: Comparison Engine  
**Output:** Pure comparison logic (no UI)
```typescript
function comparePlans(planA: PlanVariant, planB: PlanVariant): PlanComparison
```

### Task 7: Tests First
**Output:** Comprehensive test suite covering:
- Identical plans (no diffs)
- One-semester shift
- Prereq break introduced  
- Overload introduced
- Missing requirement coverage

### Task 8: Minimal UI
**Output:** Simple side-by-side comparison view
- Use `ml-dl-plans.json` as demo data
- Show credit totals per semester
- Highlight course differences
- Display requirement progress changes

### Task 9: Review Gate
**Before P3-B:** Verify comparison logic is solid and explanations are grounded

---

## Success Metrics

**Phase 3-A Complete When:**
- Can load two plan variants from JSON
- Comparison engine produces accurate diffs
- UI clearly shows differences between ML-Efficient vs DL-Implementation paths
- All diffs are explainable and verifiable

**Definition of Done:**
- Test suite passes (coverage >90%)
- Comparison logic matches real requirement semantics  
- No duplicated authority model emerged
- Ready for optimization helpers (P3-B)

---

## Non-Goals (Phase 3-A)

❌ Course recommendations  
❌ Export features  
❌ GPA projections  
❌ Complex drag-and-drop editing  
❌ Real-time semester validation  
❌ Integration with course catalog

---

## Rules for Phase 3

1. **Every status update must name the canonical repo path**
2. **No feature is "done" without tests**  
3. **No recommendations before comparison + optimization primitives are stable**
4. **If docs claim it, the system must do it**

---

*Phase 3 starts narrow and builds planning intelligence methodically. No feature swamp.*